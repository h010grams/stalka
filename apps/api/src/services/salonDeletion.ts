import { audit } from '../lib/audit.js';
import { prisma } from '../lib/prisma.js';
import { kickWalletWorker } from './wallet/sync.js';

const DAY = 24 * 3600 * 1000;
/** Сколько ждём перед окончательным удалением: Apple и Google должны успеть обновить карты. */
export const SALON_PURGE_AFTER_DAYS = 30;

/**
 * Удаление салона администратором платформы. Сразу: салон скрыт, доступ сотрудников закрыт,
 * автосообщения выключены, персональные данные клиенток стёрты, карты в Wallet аннулируются.
 * Строки остаются ещё 30 дней — по ним Apple и Google получают «карта недействительна».
 */
export async function deleteSalon(salonId: string, actorUserId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    await tx.salon.update({ where: { id: salonId }, data: { deletedAt: now } });
    await tx.loyaltyProgram.updateMany({ where: { salonId }, data: { isActive: false } });
    await tx.membership.updateMany({ where: { salonId }, data: { active: false } });
    await tx.session.updateMany({ where: { salonId }, data: { salonId: null } });
    await tx.invite.deleteMany({ where: { salonId } });
    await tx.customer.updateMany({
      where: { salonId, anonymizedAt: null },
      data: {
        name: '—',
        phoneE164: null,
        email: null,
        marketingConsentAt: null,
        birthDay: null,
        birthMonth: null,
        anonymizedAt: now,
      },
    });
    await tx.appointment.updateMany({ where: { salonId, cancelledAt: null }, data: { cancelledAt: now } });
    await tx.card.updateMany({
      where: { salonId },
      data: { status: 'VOIDED', walletNotice: null, walletUpdatedAt: now },
    });
    // все карты салона — в очередь синхронизации: Apple получит voided, Google — INACTIVE
    await tx.$executeRaw`
      INSERT INTO "WalletSyncJob" (id, "cardId")
      SELECT gen_random_uuid(), id FROM "Card" WHERE "salonId" = ${salonId}::uuid
      ON CONFLICT ("cardId") DO UPDATE SET notify = NULL, attempts = 0, "nextAttemptAt" = now(), "lastError" = NULL`;
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'admin.salon_delete',
      entityType: 'salon',
      entityId: salonId,
    });
  });
  kickWalletWorker();
}

/** Окончательно стирает салоны, удалённые больше 30 дней назад (каскадом — всё, что к ним относится). */
export async function purgeDeletedSalons(now = new Date()): Promise<number> {
  const { count } = await prisma.salon.deleteMany({
    where: { deletedAt: { lt: new Date(now.getTime() - SALON_PURGE_AFTER_DAYS * DAY) } },
  });
  return count;
}
