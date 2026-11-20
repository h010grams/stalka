import type { FastifyPluginAsync } from 'fastify';
import { adminPlanSchema, type AdminOverviewDto } from '@stalka/shared';
import { planOf } from '../../domain/plan.js';
import { audit } from '../../lib/audit.js';
import { assertUuid, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireAdmin } from '../../plugins/auth.js';

const DAY = 24 * 3600 * 1000;

type Row = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  trialEndsAt: Date;
  paidUntil: Date | null;
  ownerEmail: string | null;
  clients: bigint;
  stamps30d: bigint;
  lastStampAt: Date | null;
};

/** /api/admin — все салоны платформы, только для ADMIN_EMAILS. */
export const adminRoutes: FastifyPluginAsync = async (app) => {
  const admin = { preHandler: requireAdmin };

  app.get('/salons', admin, async (): Promise<AdminOverviewDto> => {
    const now = new Date();
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT s.id, s.name, s.slug, s."createdAt", s."trialEndsAt", s."paidUntil",
        (SELECT u.email FROM "Membership" m JOIN "User" u ON u.id = m."userId"
          WHERE m."salonId" = s.id AND m.role = 'OWNER' ORDER BY m."createdAt" LIMIT 1) AS "ownerEmail",
        (SELECT count(*) FROM "Customer" c WHERE c."salonId" = s.id AND c."anonymizedAt" IS NULL) AS clients,
        (SELECT count(*) FROM "StampEvent" e WHERE e."salonId" = s.id AND e.type = 'ADD'
          AND e."createdAt" > ${new Date(now.getTime() - 30 * DAY)}) AS "stamps30d",
        (SELECT max(e."createdAt") FROM "StampEvent" e WHERE e."salonId" = s.id) AS "lastStampAt"
      FROM "Salon" s
      ORDER BY s."createdAt" DESC`;

    const salons = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      ownerEmail: r.ownerEmail,
      createdAt: r.createdAt.toISOString(),
      plan: planOf(r, now),
      clients: Number(r.clients),
      stamps30d: Number(r.stamps30d),
      lastStampAt: r.lastStampAt?.toISOString() ?? null,
    }));
    const count = (status: string) => salons.filter((s) => s.plan.status === status).length;
    return {
      salons,
      totals: {
        salons: salons.length,
        active30d: salons.filter((s) => s.stamps30d > 0).length,
        trial: count('trial'),
        paid: count('active'),
        expired: count('expired'),
        clients: salons.reduce((n, s) => n + s.clients, 0),
      },
    };
  });

  // Отметить оплату или продлить пробный период — пока нет онлайн-оплаты
  app.post<{ Params: { id: string } }>('/salons/:id/plan', admin, async (req) => {
    const id = assertUuid(req.params.id);
    const { action } = parse(adminPlanSchema, req.body);
    const salon = await prisma.salon.findUnique({ where: { id } });
    if (!salon) throw notFound('salon_not_found');

    const now = new Date();
    // оплата продлевает от конца уже оплаченного срока, а не от сегодня
    const paidFrom = salon.paidUntil && salon.paidUntil > now ? salon.paidUntil : now;
    const trialFrom = salon.trialEndsAt > now ? salon.trialEndsAt : now;
    const data =
      action === 'paid_month'
        ? { paidUntil: new Date(new Date(paidFrom).setMonth(paidFrom.getMonth() + 1)) }
        : action === 'paid_year'
          ? { paidUntil: new Date(new Date(paidFrom).setFullYear(paidFrom.getFullYear() + 1)) }
          : action === 'trial_30'
            ? { trialEndsAt: new Date(trialFrom.getTime() + 30 * DAY) }
            : { paidUntil: null };

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.salon.update({ where: { id }, data });
      await audit(tx, {
        salonId: id,
        actorUserId: req.auth!.user.id,
        action: 'admin.plan',
        entityType: 'salon',
        entityId: id,
        payload: { action, paidUntil: s.paidUntil, trialEndsAt: s.trialEndsAt },
      });
      return s;
    });
    return { plan: planOf(updated, now) };
  });
};
