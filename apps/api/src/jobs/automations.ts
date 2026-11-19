import type { LoyaltyProgram, Salon } from '@prisma/client';
import {
  isBirthdayToday,
  isSendingHour,
  isWinbackDue,
  localParts,
  REWARD_REMINDER_AFTER_DAYS,
  WINBACK_GIVE_UP_DAYS,
  WINBACK_MIN_DAYS,
} from '../domain/automations.js';
import { t } from '../lib/i18n.js';
import { prisma } from '../lib/prisma.js';
import { notifyCard } from '../services/notify.js';
import { kickWalletWorker } from '../services/wallet/sync.js';

/**
 * Автоматические сообщения на карту:
 * - награда лежит без дела 2 недели (служебное — согласие на рекламу не нужно);
 * - «пора вернуться» по ритму визитов (только с согласием на рекламу, не чаще раза за паузу);
 * - поздравление с днём рождения (только с согласием, раз в год).
 * Всё — только днём по времени салона. Каждая отправка помечается атомарно,
 * поэтому два одновременных запуска не пришлют сообщение дважды.
 */

const DAY = 24 * 3600 * 1000;
const BATCH = 200;

type Program = LoyaltyProgram & { salon: Salon };

export interface AutomationResult {
  rewards: number;
  winback: number;
  birthdays: number;
}

export async function processAutomations(now = new Date()): Promise<AutomationResult> {
  const programs = await prisma.loyaltyProgram.findMany({
    where: { isActive: true, OR: [{ winbackEnabled: true }, { rewardReminderEnabled: true }, { birthdayEnabled: true }] },
    include: { salon: true },
  });
  const result: AutomationResult = { rewards: 0, winback: 0, birthdays: 0 };
  for (const p of programs) {
    if (!isSendingHour(now, p.salon.timezone)) continue;
    if (p.rewardReminderEnabled) result.rewards += await rewardReminders(p, now);
    if (p.winbackEnabled) result.winback += await winback(p, now);
    if (p.birthdayEnabled) result.birthdays += await birthdays(p, now);
  }
  if (result.rewards + result.winback + result.birthdays > 0) kickWalletWorker();
  return result;
}

async function rewardReminders(p: Program, now: Date): Promise<number> {
  const due = await prisma.reward.findMany({
    where: {
      salonId: p.salonId,
      status: 'AVAILABLE',
      reminderSentAt: null,
      earnedAt: { lte: new Date(now.getTime() - REWARD_REMINDER_AFTER_DAYS * DAY) },
      card: { programId: p.id, status: 'ACTIVE' },
    },
    include: { card: { include: { customer: true } } },
    take: BATCH,
  });
  // несколько наград на одной карте — одно сообщение
  const byCard = new Map<string, typeof due>();
  for (const r of due) byCard.set(r.cardId, [...(byCard.get(r.cardId) ?? []), r]);

  let sent = 0;
  for (const [cardId, rewards] of byCard) {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.reward.updateMany({
        where: { id: { in: rewards.map((r) => r.id) }, reminderSentAt: null },
        data: { reminderSentAt: now },
      });
      if (count === 0) return;
      const locale = rewards[0]!.card.customer.locale;
      await notifyCard(tx, cardId, t(locale, 'msg_reward_waiting', { reward: p.rewardText }), now);
      sent++;
    });
  }
  return sent;
}

async function winback(p: Program, now: Date): Promise<number> {
  const minIdle = new Date(now.getTime() - WINBACK_MIN_DAYS * DAY);
  const giveUp = new Date(now.getTime() - WINBACK_GIVE_UP_DAYS * DAY);
  // средний промежуток между неотменёнными визитами — «ритм» клиентки
  const rows = await prisma.$queryRaw<{ id: string; lastStampAt: Date; locale: 'sk' | 'en' | 'uk'; avgGapMs: number | null }[]>`
    SELECT k.id, k."lastStampAt", cu.locale,
      (SELECT CASE WHEN count(*) > 1
                THEN extract(epoch FROM max(e."createdAt") - min(e."createdAt")) * 1000 / (count(*) - 1)
              END::float8
       FROM "StampEvent" e
       WHERE e."cardId" = k.id AND e.type = 'ADD'
         AND NOT EXISTS (SELECT 1 FROM "StampEvent" r WHERE r."revokesEventId" = e.id)) AS "avgGapMs"
    FROM "Card" k
    JOIN "Customer" cu ON cu.id = k."customerId"
    WHERE k."programId" = ${p.id}::uuid AND k.status = 'ACTIVE'
      AND k."lastStampAt" <= ${minIdle} AND k."lastStampAt" > ${giveUp}
      AND (k."winbackSentAt" IS NULL OR k."winbackSentAt" < k."lastStampAt")
      AND cu."marketingConsentAt" IS NOT NULL AND cu."anonymizedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "Appointment" a
        WHERE a."cardId" = k.id AND a."cancelledAt" IS NULL AND a."startsAt" > ${now})
    LIMIT ${BATCH}`;

  let sent = 0;
  for (const row of rows) {
    if (!isWinbackDue(row.lastStampAt, row.avgGapMs, now)) continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.card.updateMany({
        where: { id: row.id, OR: [{ winbackSentAt: null }, { winbackSentAt: { lt: row.lastStampAt } }] },
        data: { winbackSentAt: now },
      });
      if (count === 0) return;
      await notifyCard(tx, row.id, t(row.locale, 'msg_winback', { salon: p.salon.name }), now);
      sent++;
    });
  }
  return sent;
}

async function birthdays(p: Program, now: Date): Promise<number> {
  const today = localParts(now, p.salon.timezone);
  const customers = await prisma.customer.findMany({
    where: {
      salonId: p.salonId,
      anonymizedAt: null,
      marketingConsentAt: { not: null },
      birthMonth: today.month,
      birthDay: { not: null },
      OR: [{ birthdayGreetedYear: null }, { birthdayGreetedYear: { not: today.year } }],
      cards: { some: { programId: p.id, status: 'ACTIVE' } },
    },
    include: { cards: { where: { programId: p.id, status: 'ACTIVE' }, select: { id: true } } },
    take: BATCH,
  });

  let sent = 0;
  for (const c of customers) {
    if (!isBirthdayToday(c.birthDay!, c.birthMonth!, today)) continue;
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.customer.updateMany({
        where: { id: c.id, OR: [{ birthdayGreetedYear: null }, { birthdayGreetedYear: { not: today.year } }] },
        data: { birthdayGreetedYear: today.year },
      });
      if (count === 0) return;
      const text = p.birthdayGift
        ? t(c.locale, 'msg_birthday_gift', { salon: p.salon.name, gift: p.birthdayGift })
        : t(c.locale, 'msg_birthday', { salon: p.salon.name });
      for (const card of c.cards) await notifyCard(tx, card.id, text, now);
      sent++;
    });
  }
  return sent;
}

let timer: NodeJS.Timeout | null = null;

export function startAutomationJob() {
  const run = () => processAutomations().catch((e) => console.error('[automations]', e));
  timer = setInterval(run, 10 * 60_000);
  void run();
}

export function stopAutomationJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
