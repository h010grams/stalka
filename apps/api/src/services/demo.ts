import type { DemoKind } from '@stalka/shared';
import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { formatDateTime, t } from '../lib/i18n.js';
import { prisma } from '../lib/prisma.js';
import { addStamp } from './cards.js';
import { notifyCard } from './notify.js';
import { kickWalletWorker } from './wallet/sync.js';
import type { WalletCard } from './walletCard.js';

/**
 * Живое демо на stalka.sk: посетитель добавил карту демо-салона в Wallet,
 * нажимает кнопку — и через несколько секунд на телефон приходит настоящий push.
 */


/** Пауза, чтобы успеть заблокировать экран и увидеть уведомление как клиентка. */
export const DEMO_DELAY_MS = 8_000;
const DAY = 24 * 3600_000;

export const isDemoCard = (card: WalletCard) =>
  !!config.DEMO_SALON_SLUG && card.salon.slug === config.DEMO_SALON_SLUG && !card.salon.deletedAt;

/**
 * Каждый пример — раз в сутки на карту (итого 3 — столько уведомлений в сутки показывает Google;
 * а Apple не покажет push, если текст не изменился).
 */
export async function demoUsed(card: WalletCard, now = new Date()): Promise<DemoKind[]> {
  const rows = await prisma.auditLog.findMany({
    where: { salonId: card.salonId, action: 'demo.push', entityId: card.id, createdAt: { gt: new Date(now.getTime() - DAY) } },
    select: { payload: true },
  });
  return rows.map((r) => (r.payload as { kind: DemoKind }).kind);
}

export async function sendDemoPush(card: WalletCard, kind: DemoKind, now = new Date()): Promise<void> {
  if (!isDemoCard(card)) throw new AppError(404, 'card_not_found');
  if ((await demoUsed(card, now)).includes(kind)) throw new AppError(429, 'demo_used');

  await prisma.auditLog.create({
    data: { salonId: card.salonId, action: 'demo.push', entityType: 'card', entityId: card.id, payload: { kind } },
  });

  const loc = card.customer.locale;
  if (kind === 'stamp') {
    await addStamp(card.salonId, card.id, null, now, { ignoreCooldown: true, notifyDelayMs: DEMO_DELAY_MS });
  } else {
    const text =
      kind === 'reminder'
        ? t(loc, 'msg_reminder', {
            salon: card.salon.name,
            when: formatDateTime(tomorrowAt(now, 14, card.salon.timezone), loc, card.salon.timezone),
          })
        : t(loc, 'msg_winback', { salon: card.salon.name });
    await prisma.$transaction((tx) => notifyCard(tx, card.id, text, now, DEMO_DELAY_MS));
  }
  setTimeout(kickWalletWorker, DEMO_DELAY_MS + 200).unref();
}

/** Завтра в hh:00 по времени салона — правдоподобный термин для примера. */
export function tomorrowAt(now: Date, hour: number, timeZone: string): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone })
    .format(new Date(now.getTime() + DAY))
    .split('-')
    .map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour);
  return new Date(guess - zoneOffsetMs(new Date(guess), timeZone));
}

/** На сколько местное время пояса опережает UTC в этот момент. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(date)
      .map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!) - Math.floor(date.getTime() / 60_000) * 60_000;
}
