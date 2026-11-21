import type { StaffCardDto } from '@stalka/shared';
import {
  applyBonus,
  applyRedeem,
  applyRevoke,
  applyStamp,
  canRevoke,
  type CardCounters,
  DomainError,
  nextStampAllowedAt,
  revokeDeadline,
} from '../domain/stamping.js';
import { audit } from '../lib/audit.js';
import { AppError, notFound } from '../lib/errors.js';
import { t } from '../lib/i18n.js';
import { prisma, type Tx } from '../lib/prisma.js';
import { enqueueWalletSync, kickWalletWorker } from './wallet/sync.js';

/**
 * Блокирует строку карты до конца транзакции (SELECT … FOR UPDATE):
 * два одновременных скана одной карты выполнятся строго по очереди,
 * второй увидит обновлённый lastStampAt и упрётся в лимит.
 */
async function lockCard(tx: Tx, salonId: string, cardId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Card" WHERE id = ${cardId}::uuid AND "salonId" = ${salonId}::uuid FOR UPDATE`;
  if (rows.length === 0) throw notFound('card_not_found');
  const card = await tx.card.findUniqueOrThrow({
    where: { id: cardId },
    include: { program: true, customer: true },
  });
  if (card.status !== 'ACTIVE') throw notFound('card_not_found');
  return card;
}

/** Последний неотменённый штамп карты. */
async function lastActiveStamp(db: Tx, cardId: string) {
  const rows = await db.$queryRaw<{ id: string; createdAt: Date }[]>`
    SELECT e.id, e."createdAt" FROM "StampEvent" e
    WHERE e."cardId" = ${cardId}::uuid AND e.type = 'ADD'
      AND NOT EXISTS (SELECT 1 FROM "StampEvent" r WHERE r."revokesEventId" = e.id)
    ORDER BY e.seq DESC
    LIMIT 1`;
  return rows[0] ?? null;
}

export async function getStaffCard(salonId: string, cardId: string, now = new Date()): Promise<StaffCardDto> {
  const card = await prisma.card.findFirst({
    where: { id: cardId, salonId, status: 'ACTIVE' },
    include: {
      customer: true,
      program: true,
      salon: { select: { timezone: true } },
      appointments: {
        where: { cancelledAt: null, startsAt: { gt: now } },
        orderBy: { startsAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!card) throw notFound('card_not_found');

  const last = await lastActiveStamp(prisma, card.id);
  let revocable: StaffCardDto['revocable'] = null;
  if (last && canRevoke(last.createdAt, now)) {
    const reward = await prisma.reward.findUnique({ where: { earnedByEventId: last.id } });
    if (reward?.status !== 'REDEEMED') {
      revocable = { eventId: last.id, until: revokeDeadline(last.createdAt).toISOString() };
    }
  }

  return {
    id: card.id,
    customer: {
      id: card.customer.id,
      name: card.customer.name,
      phone: card.customer.phoneE164,
      email: card.customer.email,
    },
    stampCount: card.stampCount,
    stampsRequired: card.program.stampsRequired,
    rewardsAvailable: card.rewardsAvailable,
    rewardText: card.program.rewardText,
    totalVisits: card.totalVisits,
    lastStampAt: card.lastStampAt?.toISOString() ?? null,
    nextStampAllowedAt:
      nextStampAllowedAt(card.lastStampAt, card.program.cooldownHours, now)?.toISOString() ?? null,
    revocable,
    nextAppointmentAt: card.appointments[0]?.startsAt.toISOString() ?? null,
    timezone: card.salon.timezone,
  };
}

export async function findCardIdByQr(salonId: string, qrToken: string): Promise<string> {
  const card = await prisma.card.findFirst({
    where: { qrToken, salonId, status: 'ACTIVE' },
    select: { id: true },
  });
  // карта другого салона выглядит как несуществующая
  if (!card) throw notFound('card_not_found');
  return card.id;
}

/** actorUserId = null — штамп ставит система (первый штамп при самостоятельной регистрации). */
export interface StampOptions {
  /** живое демо на сайте: без паузы между штампами */
  ignoreCooldown?: boolean;
  /** push позже, чтобы посетитель успел заблокировать телефон */
  notifyDelayMs?: number;
}

export async function addStamp(
  salonId: string,
  cardId: string,
  actorUserId: string | null,
  now = new Date(),
  opts: StampOptions = {},
) {
  const result = await prisma.$transaction(async (tx) => {
    const card = await lockCard(tx, salonId, cardId);
    const { program, customer } = card;

    const retryAt = opts.ignoreCooldown ? null : nextStampAllowedAt(card.lastStampAt, program.cooldownHours, now);
    if (retryAt) throw new DomainError('cooldown', { retryAt: retryAt.toISOString() });

    const stamped = applyStamp(card, program.stampsRequired);
    let { counters, rewardEarned } = stamped;
    const event = await tx.stampEvent.create({
      data: { salonId, cardId, type: 'ADD', actorUserId, createdAt: now },
    });
    if (rewardEarned) {
      await tx.reward.create({ data: { salonId, cardId, earnedByEventId: event.id, earnedAt: now } });
    }

    let notice = rewardEarned
      ? t(customer.locale, 'msg_reward', { reward: program.rewardText })
      : t(customer.locale, 'msg_stamp', { count: counters.stampCount, n: program.stampsRequired });

    // «Приведи подругу»: первый визит приглашённой (штамп ставит мастер, а не система) — бонус обеим
    const referral =
      actorUserId && card.referredByCardId && !card.referralRewardedAt && program.referralEnabled
        ? { referrerCardId: card.referredByCardId, bonus: program.referralBonus, actorUserId }
        : null;
    if (referral) {
      const b = await addBonusStamps(tx, salonId, cardId, counters, referral.bonus, program.stampsRequired, now);
      counters = b.counters;
      notice = b.rewardEarned || rewardEarned
        ? t(customer.locale, 'msg_reward', { reward: program.rewardText })
        : t(customer.locale, 'msg_referral_friend', {
            bonus: referral.bonus,
            count: counters.stampCount,
            n: program.stampsRequired,
          });
      rewardEarned ||= b.rewardEarned;
    }

    await tx.card.update({
      where: { id: cardId },
      data: {
        ...counters,
        lastStampAt: now,
        walletUpdatedAt: now,
        walletNotice: notice,
        ...(referral ? { referralRewardedAt: now } : {}),
      },
    });
    if (referral) {
      await rewardReferrer(tx, salonId, referral.referrerCardId, customer.name, referral.bonus, referral.actorUserId, now);
    }
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'stamp.add',
      entityType: 'card',
      entityId: cardId,
      payload: { eventId: event.id, stampCount: counters.stampCount, rewardEarned },
    });
    await enqueueWalletSync(tx, cardId, notice, opts.notifyDelayMs);
    return { rewardEarned };
  });
  kickWalletWorker();
  return result;
}

/** Бонусные штампы: событие BONUS на каждый (к нему привязывается награда, если она выпала). */
async function addBonusStamps(
  tx: Tx,
  salonId: string,
  cardId: string,
  counters: CardCounters,
  stamps: number,
  stampsRequired: number,
  now: Date,
): Promise<{ counters: CardCounters; rewardEarned: boolean }> {
  const result = applyBonus(counters, stamps, stampsRequired);
  for (let i = 0; i < stamps; i++) {
    const ev = await tx.stampEvent.create({ data: { salonId, cardId, type: 'BONUS', createdAt: now } });
    if (result.rewardAt.includes(i)) {
      await tx.reward.create({ data: { salonId, cardId, earnedByEventId: ev.id, earnedAt: now } });
    }
  }
  return { counters: result.counters, rewardEarned: result.rewardAt.length > 0 };
}

/** Бонус той, кто пригласила, — если её карта ещё активна. */
async function rewardReferrer(
  tx: Tx,
  salonId: string,
  referrerCardId: string,
  friendName: string,
  bonus: number,
  actorUserId: string,
  now: Date,
) {
  let ref;
  try {
    ref = await lockCard(tx, salonId, referrerCardId);
  } catch (e) {
    if (e instanceof AppError && e.statusCode === 404) return; // карту удалили или обезличили
    throw e;
  }
  const { counters, rewardEarned } = await addBonusStamps(
    tx,
    salonId,
    ref.id,
    ref,
    bonus,
    ref.program.stampsRequired,
    now,
  );
  const loc = ref.customer.locale;
  const notice = rewardEarned
    ? t(loc, 'msg_reward', { reward: ref.program.rewardText })
    : t(loc, 'msg_referral', {
        friend: friendName.split(/\s+/)[0]!,
        bonus,
        count: counters.stampCount,
        n: ref.program.stampsRequired,
      });
  await tx.card.update({ where: { id: ref.id }, data: { ...counters, walletUpdatedAt: now, walletNotice: notice } });
  await audit(tx, {
    salonId,
    actorUserId,
    action: 'referral.reward',
    entityType: 'card',
    entityId: ref.id,
    payload: { bonus, rewardEarned },
  });
  await enqueueWalletSync(tx, ref.id, notice);
}

export async function revokeLastStamp(salonId: string, cardId: string, actorUserId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const card = await lockCard(tx, salonId, cardId);
    const last = await lastActiveStamp(tx, cardId);
    if (!last) throw new DomainError('nothing_to_revoke');
    if (!canRevoke(last.createdAt, now)) throw new DomainError('revoke_expired');

    const reward = await tx.reward.findUnique({ where: { earnedByEventId: last.id } });
    const counters = applyRevoke(card, card.program.stampsRequired, reward);
    if (reward?.status === 'AVAILABLE') {
      await tx.reward.update({ where: { id: reward.id }, data: { status: 'VOID', voidedAt: now } });
    }

    const revoke = await tx.stampEvent.create({
      data: { salonId, cardId, type: 'REVOKE', actorUserId, revokesEventId: last.id, createdAt: now },
    });
    const previous = await lastActiveStamp(tx, cardId);
    // без нового уведомления клиентке: просто исправляем карту
    await tx.card.update({
      where: { id: cardId },
      data: { ...counters, lastStampAt: previous?.createdAt ?? null, walletUpdatedAt: now },
    });
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'stamp.revoke',
      entityType: 'card',
      entityId: cardId,
      payload: { eventId: revoke.id, revokedEventId: last.id, rewardVoided: reward?.status === 'AVAILABLE' },
    });
    await enqueueWalletSync(tx, cardId);
  });
  kickWalletWorker();
}

export async function redeemReward(salonId: string, cardId: string, actorUserId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const card = await lockCard(tx, salonId, cardId);
    const counters = applyRedeem(card);
    // гасим самую старую доступную награду
    const reward = await tx.reward.findFirst({
      where: { cardId, status: 'AVAILABLE' },
      orderBy: { earnedAt: 'asc' },
    });
    if (!reward) throw new DomainError('no_reward');
    await tx.reward.update({
      where: { id: reward.id },
      data: { status: 'REDEEMED', redeemedAt: now, redeemedByUserId: actorUserId },
    });
    const notice = t(card.customer.locale, 'msg_redeem');
    await tx.card.update({
      where: { id: cardId },
      data: { rewardsAvailable: counters.rewardsAvailable, walletUpdatedAt: now, walletNotice: notice },
    });
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'reward.redeem',
      entityType: 'card',
      entityId: cardId,
      payload: { rewardId: reward.id },
    });
    await enqueueWalletSync(tx, cardId, notice);
  });
  kickWalletWorker();
}

// ───────── Следующая запись ─────────

export async function setAppointment(salonId: string, cardId: string, actorUserId: string, startsAt: Date) {
  await prisma.$transaction(async (tx) => {
    await lockCard(tx, salonId, cardId);
    // у карты одна будущая запись: старую отменяем
    await tx.appointment.updateMany({
      where: { cardId, cancelledAt: null, startsAt: { gt: new Date() } },
      data: { cancelledAt: new Date() },
    });
    const appt = await tx.appointment.create({
      data: { salonId, cardId, startsAt, createdByUserId: actorUserId },
    });
    await tx.card.update({ where: { id: cardId }, data: { walletUpdatedAt: new Date() } });
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'appointment.set',
      entityType: 'card',
      entityId: cardId,
      payload: { appointmentId: appt.id, startsAt: startsAt.toISOString() },
    });
    await enqueueWalletSync(tx, cardId);
  });
  kickWalletWorker();
}

export async function cancelAppointment(salonId: string, cardId: string, actorUserId: string) {
  await prisma.$transaction(async (tx) => {
    await lockCard(tx, salonId, cardId);
    const { count } = await tx.appointment.updateMany({
      where: { cardId, cancelledAt: null, startsAt: { gt: new Date() } },
      data: { cancelledAt: new Date() },
    });
    if (count === 0) return;
    await tx.card.update({ where: { id: cardId }, data: { walletUpdatedAt: new Date() } });
    await audit(tx, {
      salonId,
      actorUserId,
      action: 'appointment.cancel',
      entityType: 'card',
      entityId: cardId,
    });
    await enqueueWalletSync(tx, cardId);
  });
  kickWalletWorker();
}
