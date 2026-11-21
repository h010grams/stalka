import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { PlanDto, SiteInfoDto } from '@stalka/shared';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';

const TRIAL_DAYS = 30;

/** Подписка в настройках владелицы — тёмный блок наверху. */
export function PlanCard({ plan }: { plan: PlanDto }) {
  const { t } = useTranslation();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api.get<SiteInfoDto>('/public/site'), staleTime: Infinity });
  const contact = site.data?.contactEmail;

  const label =
    plan.status === 'active' ? t('plan.label_active') : plan.status === 'trial' ? t('plan.label_trial') : t('plan.label_expired');
  const title =
    plan.status === 'active'
      ? t('plan.until', { date: formatDay(plan.paidUntil!) })
      : plan.status === 'trial'
        ? t('plan.days_left', { count: plan.daysLeft })
        : t('plan.expired_title');

  return (
    <section
      className={`mb-3.5 rounded-[22px] bg-gradient-to-br from-stone-900 to-[#3b2a24] p-4 text-white ${
        plan.status === 'expired' ? 'ring-2 ring-brand-500' : ''
      }`}
    >
      <p className="text-[11.5px] font-bold uppercase tracking-wider text-brand-300">{label}</p>
      <p className="mb-0.5 mt-1 font-display text-[22px] leading-tight">{title}</p>
      {plan.status !== 'active' && <p className="text-[13px] text-stone-300">{t('plan.price_short')}</p>}
      {plan.status === 'trial' && (
        <div className="my-3 h-1.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-brand-300"
            style={{ width: `${Math.max(4, ((TRIAL_DAYS - plan.daysLeft) / TRIAL_DAYS) * 100)}%` }}
          />
        </div>
      )}
      {plan.status !== 'active' && contact && (
        <a
          href={`mailto:${contact}`}
          className="mt-1 inline-flex min-h-10 items-center rounded-xl bg-brand-300 px-3.5 text-[13.5px] font-bold text-stone-900"
        >
          {t('plan.subscribe')}
        </a>
      )}
    </section>
  );
}
