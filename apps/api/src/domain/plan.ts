import type { PlanDto } from '@stalka/shared';

const DAY = 24 * 3600 * 1000;

/**
 * Состояние подписки салона. Оплата важнее пробного периода: салон,
 * заплативший во время пробного периода, сразу «active».
 */
export function planOf(s: { trialEndsAt: Date; paidUntil: Date | null }, now: Date): PlanDto {
  const daysUntil = (d: Date) => Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY));
  const base = { trialEndsAt: s.trialEndsAt.toISOString(), paidUntil: s.paidUntil?.toISOString() ?? null };
  if (s.paidUntil && s.paidUntil > now) return { ...base, status: 'active', daysLeft: daysUntil(s.paidUntil) };
  if (s.trialEndsAt > now) return { ...base, status: 'trial', daysLeft: daysUntil(s.trialEndsAt) };
  return { ...base, status: 'expired', daysLeft: 0 };
}
