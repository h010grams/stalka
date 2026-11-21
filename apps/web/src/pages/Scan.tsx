import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QrScanner from 'qr-scanner';
import type { CustomerListResponse, ProgramDto, StaffCardDto } from '@stalka/shared';
import { api, ApiError } from '../lib/api';
import { useCurrentRole } from '../lib/auth';
import { formatRelative } from '../lib/format';
import { Search, UserPlus } from 'lucide-react';
import { Alert, Button, Card, Input, buttonClass } from '../components/ui';
import { CustomerRow, PageTitle, SectionLabel } from '../components/app';

/** QR на карте — это случайный токен; ссылка (например, с постера) картой не является. */
function looksLikeCardToken(value: string) {
  return /^[\w-]{10,64}$/.test(value.trim());
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function ScanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const busy = useRef(false);
  const [state, setState] = useState<'starting' | 'running' | 'error'>('starting');
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const query = useDebounced(q.trim(), 300);
  const isOwner = useCurrentRole() === 'OWNER';
  const program = useQuery({ queryKey: ['program'], queryFn: () => api.get<{ program: ProgramDto | null }>('/program') });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const scanner = new QrScanner(
      video,
      async ({ data }) => {
        if (busy.current) return;
        busy.current = true;
        const resume = (msg: string) => {
          setMessage(msg);
          setTimeout(() => {
            busy.current = false;
            setMessage(null);
          }, 1800);
        };
        if (!looksLikeCardToken(data)) return resume(t('scan.not_card'));
        setMessage(t('scan.scanning'));
        try {
          const card = await api.get<StaffCardDto>(`/cards/by-qr/${encodeURIComponent(data.trim())}`);
          navigator.vibrate?.(40);
          qc.setQueryData(['staff-card', card.id], card);
          navigate(`/cards/${card.id}`);
        } catch (e) {
          const code = e instanceof ApiError ? e.code : 'internal';
          resume(t(`errors.${code}`, { defaultValue: t('errors.internal') }));
        }
      },
      { preferredCamera: 'environment', highlightScanRegion: false, highlightCodeOutline: false, maxScansPerSecond: 5 },
    );
    scannerRef.current = scanner;
    scanner
      .start()
      .then(() => setState('running'))
      .catch(() => setState('error'));
    return () => {
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [navigate, qc, t]);

  const results = useQuery({
    queryKey: ['customers', 'search', query],
    queryFn: () => api.get<CustomerListResponse>(`/customers?q=${encodeURIComponent(query)}&limit=10`),
    enabled: query.length >= 2,
  });
  // «Dnes»: последние визиты, оставляем сегодняшние
  const recent = useQuery({
    queryKey: ['customers', 'recent'],
    queryFn: () => api.get<CustomerListResponse>('/customers?sort=recent&limit=20'),
  });
  const today = new Date().toDateString();
  const todays = (recent.data?.items ?? []).filter(
    (c) => c.cardId && c.lastVisitAt && new Date(c.lastVisitAt).toDateString() === today,
  );
  const required = recent.data?.stampsRequired ?? null;

  return (
    <div>
      <PageTitle>{t('scan.title')}</PageTitle>

      {program.data && !program.data.program && (
        <Card className="mb-4 space-y-3 bg-brand-50">
          <h2 className="text-lg font-semibold">{t('setup.title')}</h2>
          <p className="text-sm text-stone-700">{t('setup.text')}</p>
          {isOwner && (
            <Link to="/setup" className={buttonClass('primary', 'w-full')}>
              {t('setup.cta')}
            </Link>
          )}
        </Card>
      )}

      <div className="relative h-[290px] overflow-hidden rounded-[26px] bg-[radial-gradient(120%_90%_at_30%_20%,#5b4a43_0%,#2a211e_55%,#151110_100%)]">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" muted playsInline />
        {state !== 'error' && (
          <div className="pointer-events-none absolute inset-x-[72px] inset-y-[54px]" aria-hidden>
            {[
              'left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl',
              'right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl',
              'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl',
              'bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl',
            ].map((c) => (
              <span key={c} className={`absolute size-[38px] border-brand-300 ${c}`} />
            ))}
            <span className="absolute inset-x-3 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-brand-300 to-transparent motion-safe:animate-pulse" />
          </div>
        )}
        {state !== 'error' && (
          <div
            role="status"
            className={`absolute bottom-4 left-1/2 max-w-[90%] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-center text-[13px] backdrop-blur ${
              message ? 'bg-white font-medium text-stone-900' : 'bg-white/15 text-white'
            }`}
          >
            {message ?? t('scan.hint_short')}
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
            <div className="space-y-3">
              <p>{t('scan.camera_error')}</p>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {t('common.retry')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 mt-3 grid grid-cols-2 gap-2.5">
        <Link
          to="/new-customer"
          className="flex flex-col gap-2.5 rounded-[22px] bg-stone-900 p-3.5 text-sm font-semibold text-white shadow-soft"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-white/12 text-brand-300">
            <UserPlus className="size-5" aria-hidden />
          </span>
          {t('scan.new_customer')}
        </Link>
        <button
          type="button"
          onClick={() => {
            setSearchOpen(true);
            setTimeout(() => searchRef.current?.focus(), 0);
          }}
          className="flex cursor-pointer flex-col gap-2.5 rounded-[22px] bg-white p-3.5 text-left text-sm font-semibold shadow-soft"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <Search className="size-5" aria-hidden />
          </span>
          {t('scan.search_tile')}
        </button>
      </div>

      {(searchOpen || q) && (
        <div className="mb-4 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-stone-400" aria-hidden />
            <Input
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('scan.search_placeholder')}
              autoComplete="off"
              className="pl-11 shadow-soft"
              aria-label={t('scan.manual')}
            />
          </div>
          {results.data && results.data.items.length === 0 && <Alert kind="info">{t('errors.customer_not_found')}</Alert>}
          {!!results.data?.items.length && (
            <ul className="divide-y divide-[#F3EEEA] overflow-hidden rounded-[22px] bg-white shadow-soft">
              {results.data.items
                .filter((c) => c.cardId)
                .map((c) => (
                  <CustomerRow
                    key={c.id}
                    c={c}
                    to={`/cards/${c.cardId}`}
                    sub={c.phone ?? c.email}
                    required={results.data.stampsRequired}
                  />
                ))}
            </ul>
          )}
        </div>
      )}

      <SectionLabel
        action={
          <Link to="/customers" className="text-[13px] font-semibold text-brand-700">
            {t('scan.today_all')}
          </Link>
        }
      >
        {t('scan.today')}
      </SectionLabel>
      {todays.length > 0 ? (
        <ul className="divide-y divide-[#F3EEEA] overflow-hidden rounded-[22px] bg-white shadow-soft">
          {todays.map((c) => (
            <CustomerRow
              key={c.id}
              c={c}
              to={`/cards/${c.cardId}`}
              sub={formatRelative(c.lastVisitAt!)}
              required={required}
            />
          ))}
        </ul>
      ) : (
        recent.data && <p className="mx-1 text-sm text-stone-500">{t('scan.today_empty')}</p>
      )}
    </div>
  );
}
