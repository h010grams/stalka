import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditItem, CustomerDetailDto, CustomerFilter, CustomerListResponse, StatsDto } from '@stalka/shared';
import { Search, Sparkles, TrendingUp, Users } from 'lucide-react';
import { CustomerRow, PageTitle } from '../components/app';
import { api } from '../lib/api';
import { useCurrentRole } from '../lib/auth';
import { formatDateTime, formatDay, formatRelative } from '../lib/format';
import { Button, Card, ErrorAlert, Input, Select, Spinner, buttonClass } from '../components/ui';

const PAGE = 50;

export function CustomersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CustomerFilter | ''>('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(id);
  }, [q]);

  const list = useInfiniteQuery({
    queryKey: ['customers', 'list', query, filter],
    queryFn: ({ pageParam }) =>
      api.get<CustomerListResponse>(
        `/customers?q=${encodeURIComponent(query)}&filter=${filter}&sort=recent&limit=${PAGE}&offset=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const first = list.data?.pages[0];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = first?.counts;
  const isOwner = useCurrentRole() === 'OWNER';
  const stats = useQuery({
    queryKey: ['stats', '30d'],
    queryFn: () => api.get<StatsDto>('/stats?period=30d'),
    enabled: isOwner,
  });

  const chips: { key: CustomerFilter | ''; label: string; n?: number }[] = [
    { key: '', label: t('customers.f_all'), n: counts?.all },
    { key: 'reward', label: t('customers.f_reward'), n: counts?.reward },
    { key: 'away', label: t('customers.f_away'), n: counts?.away },
    { key: 'new', label: t('customers.f_new'), n: counts?.new },
  ];

  return (
    <div>
      <PageTitle>{t('customers.title')}</PageTitle>

      {/* Три цифры, ради которых салон пользуется сервисом */}
      {stats.data && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { icon: Users, value: stats.data.totalCustomers, label: t('stats.tile_customers') },
            { icon: TrendingUp, value: stats.data.visits, label: t('stats.tile_visits') },
            { icon: Sparkles, value: stats.data.returningCustomers, label: t('stats.tile_returning') },
          ].map((s) => (
            <div key={s.label} className="rounded-[22px] bg-white px-2.5 py-3 shadow-soft">
              <span className="mb-2 grid size-7 place-items-center rounded-[9px] bg-brand-100 text-brand-700">
                <s.icon className="size-4" aria-hidden />
              </span>
              <p className="text-[22px] font-bold tabular-nums tracking-tight">{s.value}</p>
              <p className="text-[11.5px] leading-tight text-stone-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-400" aria-hidden />
        <Input
          type="search"
          placeholder={t('customers.search')}
          aria-label={t('customers.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="border-transparent pl-11 shadow-soft"
        />
      </div>

      <div className="-mx-5 my-3 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {chips.map((c) => (
          <button
            key={c.key || 'all'}
            type="button"
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 py-[7px] text-[12.5px] font-semibold transition-colors ${
              filter === c.key ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-inset ring-[#EDE5E0]'
            }`}
          >
            {c.label}
            {c.n !== undefined && ` ${c.n}`}
          </button>
        ))}
      </div>

      {list.isLoading && <Spinner />}
      <ErrorAlert error={list.error} />
      {first && first.total === 0 && (
        <Card className="text-center text-stone-600">
          {!query && !filter ? t('customers.empty') : filter ? t('customers.empty_filter') : t('errors.customer_not_found')}
        </Card>
      )}

      {items.length > 0 && (
        <>
          <ul className="divide-y divide-[#F3EEEA] overflow-hidden rounded-[22px] bg-white shadow-soft">
            {items.map((c) => (
              <CustomerRow
                key={c.id}
                c={c}
                to={`/customers/${c.id}`}
                sub={c.lastVisitAt ? formatRelative(c.lastVisitAt) : (c.phone ?? c.email ?? '—')}
                required={first?.stampsRequired ?? null}
              />
            ))}
          </ul>
          {list.hasNextPage && (
            <Button variant="secondary" className="mt-3 w-full" loading={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
              {t('customers.more')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isOwner = useCurrentRole() === 'OWNER';
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => api.get<CustomerDetailDto>(`/customers/${id}`) });
  const del = useMutation({
    mutationFn: () => api.delete(`/customers/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      navigate('/customers', { replace: true });
    },
  });

  if (customer.isLoading) return <Spinner />;
  if (customer.error) return <ErrorAlert error={customer.error} />;
  const c = customer.data!;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{c.name}</h1>
        <p className="text-sm text-stone-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</p>
      </div>

      <Card className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-bold tabular-nums">{c.totalVisits}</p>
          <p className="text-xs text-stone-500">{t('stats.visits')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{c.stampCount}</p>
          <p className="text-xs text-stone-500">{t('card.stamps')}</p>
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums">{c.rewardsAvailable}</p>
          <p className="text-xs text-stone-500">{t('card.available')}</p>
        </div>
      </Card>

      {c.cardId && (
        <Link to={`/cards/${c.cardId}`} className={buttonClass('primary', 'w-full')}>{t('customers.open_card')}</Link>
      )}

      <Card flush>
        <h2 className="px-4 pt-4 font-semibold">{t('customers.history')}</h2>
        <ul className="divide-y divide-stone-100">
          {c.history.map((h) => (
            <li key={h.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
              <span className={h.type === 'STAMP_REVOKED' ? 'text-stone-400 line-through' : ''}>
                {t(`customers.h_${h.type}`)}
                {h.actorName && <span className="text-stone-500"> · {h.actorName}</span>}
              </span>
              <span className="shrink-0 text-stone-500">{formatDateTime(h.at)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="space-y-1 text-xs text-stone-500">
        <p>{t('customers.registered', { date: formatDay(c.createdAt) })}</p>
        <p>{t('customers.consent', { date: formatDay(c.consentAt), version: c.consentVersion })}</p>
        <p>
          {c.marketingConsentAt
            ? t('customers.marketing_yes', { date: formatDay(c.marketingConsentAt) })
            : t('customers.marketing_no')}
        </p>
        {c.birthday && <p>{t('customers.birthday', { date: `${c.birthday.day}. ${c.birthday.month}.` })}</p>}
      </div>

      {isOwner && (
        <details className="rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-stone-600">{t('customers.gdpr')}</summary>
          <div className="mt-3 space-y-2">
          <ErrorAlert error={del.error} />
          <a href={`/api/customers/${id}/export`} download className={buttonClass('secondary', 'w-full')}>{t('customers.export')}</a>
          <Button
            variant="danger"
            className="w-full"
            loading={del.isPending}
            onClick={() => window.confirm(t('customers.delete_confirm', { name: c.name })) && del.mutate()}
          >
            {t('customers.delete')}
          </Button>
          </div>
        </details>
      )}
    </div>
  );
}

export function AuditPage() {
  const { t } = useTranslation();
  const log = useInfiniteQuery({
    queryKey: ['audit'],
    queryFn: ({ pageParam }) =>
      api.get<{ items: AuditItem[] }>(`/audit${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => (last.items.length === 50 ? last.items.at(-1)!.createdAt : undefined),
  });
  const items = log.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
      {log.isLoading && <Spinner />}
      <ErrorAlert error={log.error} />
      {log.data && items.length === 0 && <p className="text-stone-500">{t('audit.empty')}</p>}
      {items.length > 0 && (
        <Card flush>
          <ul className="divide-y divide-stone-100">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{t(`audit.a.${i.action}`, { defaultValue: i.action })}</span>
                  <span className="text-stone-500"> · {i.actorName ?? t('audit.system')}</span>
                </span>
                <span className="shrink-0 text-stone-500">{formatDateTime(i.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {log.hasNextPage && (
        <Button variant="secondary" className="w-full" loading={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
          {t('audit.more')}
        </Button>
      )}
    </div>
  );
}
