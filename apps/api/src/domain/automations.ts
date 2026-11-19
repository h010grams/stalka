/**
 * Правила автоматических сообщений — чистые функции без БД.
 *
 * «Пора вернуться» считается от обычного ритма клиентки: кто ходит раз в три недели,
 * получит напоминание раньше, чем тот, кто ходит раз в два месяца.
 */

const DAY = 24 * 3600 * 1000;

/** Награда лежит неиспользованной столько дней — напоминаем. */
export const REWARD_REMINDER_AFTER_DAYS = 14;
/** Ритм неизвестен (меньше двух визитов) — ждём столько. */
export const WINBACK_DEFAULT_DAYS = 42;
export const WINBACK_MIN_DAYS = 21;
export const WINBACK_MAX_DAYS = 120;
/** Дольше этого клиентка, скорее всего, ушла — не тревожим. */
export const WINBACK_GIVE_UP_DAYS = 180;
/** Сообщения уходят только днём по времени салона: [с, до). */
export const SEND_FROM_HOUR = 10;
export const SEND_UNTIL_HOUR = 19;

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export function localParts(now: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

export function isSendingHour(now: Date, timeZone: string): boolean {
  const { hour } = localParts(now, timeZone);
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR;
}

/** Через сколько без визита напоминать: полтора обычных промежутка, в пределах 3–17 недель. */
export function winbackAfterMs(avgGapMs: number | null): number {
  if (!avgGapMs || avgGapMs <= 0) return WINBACK_DEFAULT_DAYS * DAY;
  return Math.min(WINBACK_MAX_DAYS * DAY, Math.max(WINBACK_MIN_DAYS * DAY, avgGapMs * 1.5));
}

export function isWinbackDue(lastStampAt: Date, avgGapMs: number | null, now: Date): boolean {
  const idle = now.getTime() - lastStampAt.getTime();
  return idle >= winbackAfterMs(avgGapMs) && idle < WINBACK_GIVE_UP_DAYS * DAY;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** 29 февраля в невисокосный год поздравляем 28-го. */
export function isBirthdayToday(day: number, month: number, today: Pick<LocalParts, 'year' | 'month' | 'day'>): boolean {
  if (month === 2 && day === 29 && !isLeap(today.year)) return today.month === 2 && today.day === 28;
  return today.month === month && today.day === day;
}
