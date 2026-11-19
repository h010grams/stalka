import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { PlanDto, SiteInfoDto } from '@stalka/shared';
import { api } from '../lib/api';
import { formatDay } from '../lib/format';
import { Card, buttonClass } from './ui';

/** Состояние подписки в настройках владелицы. */
export function PlanCard({ plan }: { plan: PlanDto }) {
  const { t } = useTranslation();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api.get<SiteInfoDto>('/public/site'), staleTime: Infinity });
  const contact = site.data?.contactEmail;
  const text =
    plan.status === 'active'
      ? t('plan.active', { date: formatDay(plan.paidUntil!) })
      : plan.status === 'trial'
        ? t('plan.trial', { count: plan.daysLeft })
        : t('plan.expired');

  return (
    <Card className={`space-y-2 ${plan.status === 'expired' ? 'ring-2 ring-brand-500' : ''}`}>
      <h2 className="font-semibold">{t('plan.title')}</h2>
      <p className="text-sm">{text}</p>
      {plan.status !== 'active' && <p className="text-sm text-stone-500">{t('plan.price')}</p>}
      {plan.status !== 'active' && contact && (
        <a href={`mailto:${contact}`} className={buttonClass(plan.status === 'expired' ? 'primary' : 'secondary', 'w-full')}>
          {t('plan.contact')}
        </a>
      )}
    </Card>
  );
}
