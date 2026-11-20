import { useMemo, useState } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdminOverviewDto, AdminSalonItem } from '@stalka/shared';
import { api } from '../lib/api';
import { useMe } from '../lib/auth';
import { formatDay, formatRelative } from '../lib/format';
import { Button, Card, ErrorAlert, Input, Select, Spinner } from '../components/ui';

type Filter = 'all' | 'trial' | 'active' | 'expired';
type Action = 'paid_month' | 'paid_year' | 'trial_30' | 'cancel_paid';

const BADGE = {
  trial: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  expired: 'bg-red-100 text-red-800',
} as const;

/** Админка владельца платформы: все салоны, активность и ручная отметка оплаты. */
export function AdminPage() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const data = useQuery({
    queryKey: ['admin', 'salons'],
    queryFn: () => api.get<AdminOverviewDto>('/admin/salons'),
    enabled: !!me?.isAdmin,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: ({ id, confirmSlug }: { id: string; confirmSlug: string }) =>
      api.delete(`/admin/salons/${id}`, { confirmSlug }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'salons'] }),
  });
  const plan = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) => api.post(`/admin/salons/${id}/plan`, { action }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'salons'] }),
  });

  const salons = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.salons ?? []).filter(
      (s) =>
        (filter === 'all' || s.plan.status === filter) &&
        (!needle || [s.name, s.slug, s.ownerEmail ?? ''].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [data.data, q, filter]);

  if (isLoading) return <Spinner />;
  if (!me?.isAdmin) return <Navigate to="/" replace />;
  if (data.isLoading) return <Spinner />;
  if (data.error) return <ErrorAlert error={data.error} />;
  const totals = data.data!.totals;

  const askDelete = (s: AdminSalonItem) => {
    const typed = window.prompt(t('admin.delete_prompt', { name: s.name, slug: s.slug }));
    if (typed === null) return;
    if (typed.trim() !== s.slug) {
      setNotice(t('admin.delete_mismatch'));
      return;
    }
    setNotice(null);
    remove.mutate({ id: s.id, confirmSlug: typed.trim() });
  };

  const run = (s: AdminSalonItem, action: Action, label: string) => {
    const msg =
      action === 'cancel_paid' ? t('admin.a_cancel_confirm', { name: s.name }) : t('admin.a_confirm', { action: label, name: s.name });
    if (window.confirm(msg)) plan.mutate({ id: s.id, action });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl">{t('admin.title')}</h1>
        <p className="text-sm text-stone-500">{t('admin.subtitle')}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['t_salons', totals.salons],
            ['t_active', totals.active30d],
            ['t_clients', totals.clients],
            ['t_trial', totals.trial],
            ['t_paid', totals.paid],
            ['t_expired', totals.expired],
          ] as const
        ).map(([key, value]) => (
          <Card key={key} className="p-3 text-center">
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs leading-tight text-stone-500">{t(`admin.${key}`)}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <Input type="search" placeholder={t('admin.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="w-40 shrink-0">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="filter">
            {(['all', 'trial', 'active', 'expired'] as const).map((f) => (
              <option key={f} value={f}>
                {t(`admin.f_${f}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorAlert error={plan.error ?? remove.error} />
      {notice && <p className="text-sm text-red-600">{notice}</p>}
      {salons.length === 0 && <p className="text-sm text-stone-500">{t('admin.empty')}</p>}

      <div className="space-y-3">
        {salons.map((s) => (
          <Card key={s.id} className={`space-y-3 ${s.deletedAt ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a href={`/j/${s.slug}`} target="_blank" rel="noreferrer" className="block truncate font-semibold hover:underline">
                  {s.name}
                </a>
                {s.ownerEmail && (
                  <a href={`mailto:${s.ownerEmail}`} className="block truncate text-sm text-stone-500 hover:underline">
                    {s.ownerEmail}
                  </a>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${s.deletedAt ? 'bg-stone-200 text-stone-600' : BADGE[s.plan.status]}`}
              >
                {s.deletedAt
                  ? t('admin.s_deleted')
                  : s.plan.status === 'trial'
                  ? t('admin.s_trial', { n: s.plan.daysLeft })
                  : s.plan.status === 'active'
                    ? t('admin.s_active', { date: formatDay(s.plan.paidUntil!) })
                    : t('admin.s_expired')}
              </span>
            </div>
            <div className="grid gap-0.5 text-sm text-stone-600 sm:grid-cols-2">
              <span>{t('admin.registered', { date: formatDay(s.createdAt) })}</span>
              <span>{t('admin.clients', { n: s.clients })}</span>
              <span>{t('admin.stamps', { n: s.stamps30d })}</span>
              <span>{s.lastStampAt ? t('admin.last', { when: formatRelative(s.lastStampAt) }) : t('admin.never')}</span>
            </div>
            {s.deletedAt ? (
              <p className="text-sm text-stone-500">
                {t('admin.deleted_note', { date: formatDay(new Date(new Date(s.deletedAt).getTime() + 30 * 864e5).toISOString()) })}
              </p>
            ) : (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['paid_month', 'a_month'],
                  ['paid_year', 'a_year'],
                  ['trial_30', 'a_trial'],
                ] as const
              ).map(([action, key]) => (
                <Button
                  key={action}
                  variant="secondary"
                  className="min-h-9 px-3"
                  disabled={plan.isPending}
                  onClick={() => run(s, action, t(`admin.${key}`))}
                >
                  {t(`admin.${key}`)}
                </Button>
              ))}
              {s.plan.paidUntil && (
                <Button
                  variant="danger"
                  className="min-h-9 px-3"
                  disabled={plan.isPending}
                  onClick={() => run(s, 'cancel_paid', t('admin.a_cancel'))}
                >
                  {t('admin.a_cancel')}
                </Button>
              )}
              <Button variant="danger" className="min-h-9 px-3" disabled={remove.isPending} onClick={() => askDelete(s)}>
                {t('admin.a_delete')}
              </Button>
            </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
