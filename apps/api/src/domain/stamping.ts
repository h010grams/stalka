/**
 * Правила штампов и наград — чистые функции без БД.
 *
 * Модель: на N-м штампе создаётся награда, а счётчик сразу начинает новый цикл
 * (награды копятся, клиентка использует их когда хочет).
 */

export interface CardCounters {
  stampCount: number;
  rewardsAvailable: number;
  totalVisits: number;
}

/** Сколько часов после штампа его ещё можно отменить. */
export const REVOKE_WINDOW_HOURS = 24;

const HOUR = 3600 * 1000;

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Когда можно поставить следующий штамп; null — уже можно. */
export function nextStampAllowedAt(lastStampAt: Date | null, cooldownHours: number, now: Date): Date | null {
  if (!lastStampAt || cooldownHours <= 0) return null;
  const allowed = new Date(lastStampAt.getTime() + cooldownHours * HOUR);
  return allowed.getTime() > now.getTime() ? allowed : null;
}

export function applyStamp(
  c: CardCounters,
  stampsRequired: number,
): { counters: CardCounters; rewardEarned: boolean } {
  const count = c.stampCount + 1;
  if (count >= stampsRequired) {
    return {
      counters: { stampCount: 0, rewardsAvailable: c.rewardsAvailable + 1, totalVisits: c.totalVisits + 1 },
      rewardEarned: true,
    };
  }
  return {
    counters: { stampCount: count, rewardsAvailable: c.rewardsAvailable, totalVisits: c.totalVisits + 1 },
    rewardEarned: false,
  };
}

/**
 * Бонусные штампы (за приглашённую подругу): как обычные, но это не визит.
 * Возвращает, какой по счёту бонусный штамп принёс награду (для привязки награды к событию).
 */
export function applyBonus(
  c: CardCounters,
  stamps: number,
  stampsRequired: number,
): { counters: CardCounters; rewardAt: number[] } {
  let { stampCount, rewardsAvailable } = c;
  const rewardAt: number[] = [];
  for (let i = 0; i < stamps; i++) {
    stampCount++;
    if (stampCount >= stampsRequired) {
      stampCount = 0;
      rewardsAvailable++;
      rewardAt.push(i);
    }
  }
  return { counters: { stampCount, rewardsAvailable, totalVisits: c.totalVisits }, rewardAt };
}

export function applyRedeem(c: CardCounters): CardCounters {
  if (c.rewardsAvailable <= 0) throw new DomainError('no_reward');
  return { ...c, rewardsAvailable: c.rewardsAvailable - 1 };
}

export function canRevoke(stampedAt: Date, now: Date): boolean {
  return now.getTime() - stampedAt.getTime() <= REVOKE_WINDOW_HOURS * HOUR;
}

export function revokeDeadline(stampedAt: Date): Date {
  return new Date(stampedAt.getTime() + REVOKE_WINDOW_HOURS * HOUR);
}

/**
 * Отмена последнего штампа.
 * Если этот штамп принёс награду — награда аннулируется, а счётчик возвращается к N-1.
 * Если награду уже использовали — отменять нельзя (услугу уже оказали).
 */
export function applyRevoke(
  c: CardCounters,
  stampsRequired: number,
  earnedReward: { status: 'AVAILABLE' | 'REDEEMED' | 'VOID' } | null,
): CardCounters {
  const totalVisits = Math.max(0, c.totalVisits - 1);
  if (earnedReward && earnedReward.status !== 'VOID') {
    if (earnedReward.status === 'REDEEMED') throw new DomainError('reward_already_redeemed');
    return {
      stampCount: Math.max(0, stampsRequired - 1),
      rewardsAvailable: Math.max(0, c.rewardsAvailable - 1),
      totalVisits,
    };
  }
  return { stampCount: Math.max(0, c.stampCount - 1), rewardsAvailable: c.rewardsAvailable, totalVisits };
}
