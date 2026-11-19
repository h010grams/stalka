import type { FastifyPluginAsync } from 'fastify';
import { broadcastSchema, type BroadcastItem, type BroadcastsDto } from '@stalka/shared';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireTenant } from '../../plugins/auth.js';
import { notifyCards } from '../../services/notify.js';
import { kickWalletWorker } from '../../services/wallet/sync.js';

/**
 * Не чаще одной рассылки в сутки: Google Wallet пропускает ~3 сообщения на карту в день,
 * а частые сообщения клиентки просто выключают.
 */
export const BROADCAST_EVERY_MS = 24 * 3600 * 1000;

/** Кому дойдёт рассылка: активная карта и согласие на рекламные сообщения. */
const recipientsWhere = (salonId: string) => ({
  salonId,
  status: 'ACTIVE' as const,
  customer: { marketingConsentAt: { not: null }, anonymizedAt: null },
});

function nextAllowed(last: { createdAt: Date } | null, now: Date): Date | null {
  if (!last) return null;
  const at = new Date(last.createdAt.getTime() + BROADCAST_EVERY_MS);
  return at > now ? at : null;
}

const toItem = (b: { id: string; text: string; recipients: number; createdAt: Date }): BroadcastItem => ({
  id: b.id,
  text: b.text,
  recipients: b.recipients,
  createdAt: b.createdAt.toISOString(),
});

/** /api/broadcasts — сообщение всем клиенткам салона на карту в Wallet. */
export const broadcastRoutes: FastifyPluginAsync = async (app) => {
  const owner = { preHandler: requireTenant('OWNER') };

  app.get('/', owner, async (req): Promise<BroadcastsDto> => {
    const { salonId } = req.tenant!;
    const [reachable, items] = await Promise.all([
      prisma.card.count({ where: recipientsWhere(salonId) }),
      prisma.broadcast.findMany({ where: { salonId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return {
      reachable,
      nextAllowedAt: nextAllowed(items[0] ?? null, new Date())?.toISOString() ?? null,
      items: items.map(toItem),
    };
  });

  app.post('/', owner, async (req, reply) => {
    const { salonId } = req.tenant!;
    const { text } = parse(broadcastSchema, req.body);
    const now = new Date();

    const broadcast = await prisma.$transaction(async (tx) => {
      // две одновременные рассылки одного салона идут строго по очереди
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${salonId}))`;
      const last = await tx.broadcast.findFirst({ where: { salonId }, orderBy: { createdAt: 'desc' } });
      const retryAt = nextAllowed(last, now);
      if (retryAt) throw conflict('broadcast_too_soon', { retryAt: retryAt.toISOString() });

      const cards = await tx.card.findMany({ where: recipientsWhere(salonId), select: { id: true } });
      if (cards.length === 0) throw badRequest('no_recipients');

      await notifyCards(tx, cards.map((c) => c.id), text, now);
      const created = await tx.broadcast.create({
        data: { salonId, text, recipients: cards.length, createdByUserId: req.auth!.user.id, createdAt: now },
      });
      await audit(tx, {
        salonId,
        actorUserId: req.auth!.user.id,
        action: 'broadcast.send',
        entityType: 'broadcast',
        entityId: created.id,
        payload: { recipients: cards.length },
      });
      return created;
    });
    kickWalletWorker();
    return reply.code(201).send(toItem(broadcast));
  });
};
