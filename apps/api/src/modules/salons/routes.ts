import type { FastifyPluginAsync } from 'fastify';
import type { Salon } from '@prisma/client';
import { updateSalonSchema, type SalonDto } from '@stalka/shared';
import { audit } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { requireTenant } from '../../plugins/auth.js';
import { planOf } from '../../domain/plan.js';
import { enqueueProgramSync, kickWalletWorker } from '../../services/wallet/sync.js';

// Эти поля видны на карте в Wallet → после изменения карты нужно пересобрать
const ON_CARD = ['name', 'address', 'phone', 'bookingUrl', 'reviewUrl'] as const;

function toDto(s: Salon): SalonDto {
  return {
    id: s.id,
    name: s.name,
    slug: s.slug,
    address: s.address,
    phone: s.phone,
    bookingUrl: s.bookingUrl,
    reviewUrl: s.reviewUrl,
    defaultLocale: s.defaultLocale,
    timezone: s.timezone,
    plan: planOf(s, new Date()),
  };
}

/** /api/salon — текущий салон из сессии. */
export const salonRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: requireTenant() }, async (req) => {
    const salon = await prisma.salon.findUniqueOrThrow({ where: { id: req.tenant!.salonId } });
    return toDto(salon);
  });

  app.patch('/', { preHandler: requireTenant('OWNER') }, async (req) => {
    const { salonId } = req.tenant!;
    const input = parse(updateSalonSchema, req.body);
    let resync = false;
    const salon = await prisma.$transaction(async (tx) => {
      const before = await tx.salon.findUniqueOrThrow({ where: { id: salonId } });
      const salon = await tx.salon.update({ where: { id: salonId }, data: input });
      if (ON_CARD.some((k) => input[k] !== undefined && before[k] !== salon[k])) {
        const programs = await tx.loyaltyProgram.findMany({ where: { salonId }, select: { id: true } });
        for (const p of programs) await enqueueProgramSync(tx, p.id);
        resync = programs.length > 0;
      }
      await audit(tx, {
        salonId,
        actorUserId: req.auth!.user.id,
        action: 'salon.update',
        entityType: 'salon',
        entityId: salonId,
        payload: input,
      });
      return salon;
    });
    if (resync) kickWalletWorker();
    return toDto(salon);
  });
};
