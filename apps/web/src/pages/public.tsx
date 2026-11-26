import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { BellRing, CalendarPlus, Check, Copy, Gift, Phone, Send, Share2, Star } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEMO_KINDS, joinSchema, type DemoKind, type Locale, type PublicCardDto, type PublicSalonDto } from '@stalka/shared';
import { api } from '../lib/api';
import { CardVisual } from '../components/CardVisual';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BirthdayFields, MarketingCheckbox } from '../components/JoinExtras';
import { Alert, Button, ErrorAlert, Field, Input, Spinner } from '../components/ui';

const APP_NAME = 'Stálka';

function savedCard(slug: string): string | null {
  try {
    return localStorage.getItem(`card:${slug}`);
  } catch {
    return null;
  }
}
function rememberCard(slug: string, serial: string) {
  try {
    localStorage.setItem(`card:${slug}`, serial);
  } catch {
    // приватный режим — не страшно, карта всё равно в Wallet
  }
}

function usePublicSalon(slug: string, ref = '') {
  return useQuery({
    queryKey: ['public-salon', slug, ref],
    queryFn: () => api.get<PublicSalonDto>(`/public/salons/${slug}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`),
    retry: false,
  });
}

export function PublicLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-10 pt-4">
      <div className="mb-4 flex justify-end">
        <LanguageSwitcher />
      </div>
      <Outlet />
      <p className="mt-auto pt-10 text-center text-xs text-stone-400">{APP_NAME}</p>
    </div>
  );
}

// ───────── /j/:slug — регистрация по QR с постера ─────────

export function JoinPage() {
  const { slug = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // код подруги из ссылки «Odporučte nás»
  const ref = (useSearchParams()[0].get('ref') ?? '').slice(0, 32);
  const salon = usePublicSalon(slug, ref);
  const form = useForm({ resolver: zodResolver(joinSchema), defaultValues: { name: '', phone: '', email: '' } });
  const join = useMutation({
    mutationFn: (v: object) =>
      api.post<{ serial: string }>(`/public/salons/${slug}/join`, {
        ...v,
        locale: i18n.language as Locale,
        ...(salon.data?.referral ? { ref } : {}),
      }),
    onSuccess: ({ serial }) => {
      rememberCard(slug, serial);
      navigate(`/c/${serial}`);
    },
  });

  if (salon.isLoading) return <Spinner />;
  if (salon.error) return <Alert>{t('join.not_found')}</Alert>;
  const s = salon.data!;
  const p = s.program;
  const existing = savedCard(slug);
  const { errors } = form.formState;

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-bold">{s.name}</h1>
        <p className="text-stone-600">{t('join.title')}</p>
      </div>

      {!p ? (
        <Alert kind="info">{t('join.no_program')}</Alert>
      ) : (
        <>
          <CardVisual
            salonName={s.name}
            logoUrl={p.logoUrl}
            stampCount={0}
            stampsRequired={p.stampsRequired}
            rewardText={p.rewardText}
            bgColor={p.bgColor}
            fgColor={p.fgColor}
            labelColor={p.labelColor}
            stampShape={p.stampShape}
            stampIcon={p.stampIcon}
          />
          <p className="text-center font-semibold">
            {t('join.reward_line', { n: p.stampsRequired, reward: p.rewardText })}
          </p>

          {s.referral && (
            <Alert kind="success">
              <Gift className="mr-1.5 inline size-4 align-[-2px]" aria-hidden />
              {t('join.referral', s.referral)}
            </Alert>
          )}

          {existing && (
            <Alert kind="info">
              {t('join.have_card')}{' '}
              <Link to={`/c/${existing}`} className="font-semibold underline">
                {t('join.open_my_card')}
              </Link>
            </Alert>
          )}

          <form className="space-y-4" onSubmit={form.handleSubmit((v) => join.mutate(v))} noValidate>
            <ErrorAlert error={join.error} />
            <Field label={t('join.name')} error={errors.name?.message}>
              <Input autoComplete="given-name" {...form.register('name')} />
            </Field>
            <Field label={t('join.phone')} error={errors.phone?.message}>
              <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="0905 123 456" {...form.register('phone')} />
            </Field>
            <Field label={t('join.email')} error={errors.email?.message}>
              <Input type="email" inputMode="email" autoComplete="email" {...form.register('email')} />
            </Field>
            <p className="-mt-2 text-xs text-stone-500">{t('join.contact_hint')}</p>
            <BirthdayFields register={form.register} errors={errors} />

            <label className="flex gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-stone-900" {...form.register('consent')} />
              <span>
                {t('join.consent', { salon: s.name })}{' '}
                <Link to={`/j/${slug}/privacy`} className="underline">
                  {t('join.privacy_link')}
                </Link>
              </span>
            </label>
            {errors.consent && <p className="-mt-2 text-sm text-red-600">{t(errors.consent.message ?? 'v.consent')}</p>}
            <MarketingCheckbox register={form.register} label={t('join.marketing', { salon: s.name })} />

            <Button type="submit" className="w-full" loading={join.isPending}>
              {t('join.submit')}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

// ───────── /c/:serial — карта клиентки ─────────

function platform(): 'ios' | 'android' | 'other' {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

/** «Odporučte nás»: личная ссылка клиентки — отправить через меню телефона или скопировать. */
function ReferralShare({ salonName, url, bonus }: { salonName: string; url: string; bonus: number }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const text = t('public_card.refer_message', { salon: salonName });
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const share = async () => {
    try {
      await navigator.share({ text, url });
    } catch {
      // закрыли меню — ничего не делаем
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('public_card.refer_copy'), url);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <Gift className="mt-0.5 size-5 shrink-0 text-rose-700" aria-hidden />
        <div>
          <h2 className="font-semibold">{t('public_card.refer_title')}</h2>
          <p className="text-sm text-stone-600">{t('public_card.refer_text', { bonus })}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white"
          >
            <Share2 className="size-4" aria-hidden /> {t('public_card.refer_share')}
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium"
        >
          {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? t('public_card.refer_copied') : t('public_card.refer_copy')}
        </button>
      </div>
    </section>
  );
}

/** Живое демо (только карты демо-салона): посетитель шлёт себе настоящий push. */
function DemoPush({ serial, used, hasWallet }: { serial: string; used: DemoKind[]; hasWallet: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: (kind: DemoKind) => api.post<PublicCardDto>(`/public/cards/${serial}/demo`, { kind }),
    onSuccess: (data) => qc.setQueryData(['public-card', serial], data),
  });
  const labels: Record<DemoKind, string> = {
    stamp: t('public_card.demo_stamp'),
    reminder: t('public_card.demo_reminder'),
    winback: t('public_card.demo_winback'),
  };
  const allDone = DEMO_KINDS.every((k) => used.includes(k));
  return (
    <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <BellRing className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden />
        <div>
          <h2 className="font-semibold">{t('public_card.demo_title')}</h2>
          <p className="text-sm text-stone-600">{t(hasWallet ? 'public_card.demo_text' : 'public_card.demo_no_wallet')}</p>
        </div>
      </div>
      {hasWallet && (
        <div className="grid gap-2">
          {DEMO_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              disabled={used.includes(k) || send.isPending}
              onClick={() => send.mutate(k)}
              className="flex min-h-11 items-center justify-between rounded-xl bg-white px-4 text-sm font-medium shadow-sm ring-1 ring-stone-200 disabled:opacity-50"
            >
              {labels[k]}
              {used.includes(k) ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Send className="size-4" aria-hidden />}
            </button>
          ))}
        </div>
      )}
      <ErrorAlert error={send.error} />
      {send.isSuccess && !allDone && <p className="text-sm font-medium text-emerald-700" role="status">{t('public_card.demo_sent')}</p>}
      {allDone && <p className="text-sm text-stone-600">{t('public_card.demo_done')}</p>}
    </section>
  );
}

/** Запись, звонок и отзыв — только те, что салон указал. */
function SalonActions({ bookingUrl, reviewUrl, phone }: { bookingUrl: string | null; reviewUrl: string | null; phone: string | null }) {
  const { t } = useTranslation();
  if (!bookingUrl && !reviewUrl && !phone) return null;
  const btn = 'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium';
  return (
    <div className="space-y-3">
      {(bookingUrl || phone) && (
        <div className="flex flex-wrap gap-2">
          {bookingUrl && (
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className={`${btn} bg-stone-900 text-white`}>
              <CalendarPlus className="size-4" aria-hidden /> {t('public_card.book')}
            </a>
          )}
          {phone && (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`${btn} border border-stone-300 bg-white`}>
              <Phone className="size-4" aria-hidden /> {t('public_card.call')}
            </a>
          )}
        </div>
      )}
      {reviewUrl && (
        <a
          href={reviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-sm font-medium text-stone-700 underline underline-offset-4"
        >
          <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> {t('public_card.review')}
        </a>
      )}
    </div>
  );
}

function WalletButton({ href, kind }: { href: string; kind: 'apple' | 'google' }) {
  const { t, i18n } = useTranslation();
  // Официальные значки Apple и Google: менять цвет, текст и пропорции нельзя по правилам брендов.
  // Значки Apple — по Wallet Marketing Artwork License (аккаунт Apple Developer), вокруг нужен отступ ≥ 0,1 высоты.
  const lang = (['sk', 'en', 'uk'] as const).find((l) => i18n.language.startsWith(l)) ?? 'en';
  return (
    <a
      href={href}
      className={`mx-auto block w-fit focus-visible:outline-2 focus-visible:outline-offset-2 ${kind === 'google' ? 'rounded-full' : 'rounded-lg'}`}
    >
      <img
        src={`/wallet/${kind}-${lang}.svg`}
        alt={t(kind === 'google' ? 'public_card.add_google' : 'public_card.add_apple')}
        className="h-12 w-auto"
      />
    </a>
  );
}

export function CardPage() {
  const { serial = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  // карта с именем клиентки не должна попасть в поиск, даже если ссылку где-то опубликуют
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  const marketing = useMutation({
    mutationFn: (enabled: boolean) => api.post<PublicCardDto>(`/public/cards/${serial}/marketing`, { enabled }),
    onSuccess: (data) => qc.setQueryData(['public-card', serial], data),
  });
  const card = useQuery({
    queryKey: ['public-card', serial],
    queryFn: () => api.get<PublicCardDto>(`/public/cards/${serial}`),
    retry: false,
    refetchInterval: 20_000, // веб-карта обновляется после штампа без перезагрузки
    refetchOnWindowFocus: true,
  });

  if (card.isLoading) return <Spinner />;
  if (card.error) return <Alert>{t('public_card.not_found')}</Alert>;
  const c = card.data!;
  const os = platform();
  const buttons = (
    [
      c.wallet.apple && { kind: 'apple' as const, href: `/api/public/cards/${serial}/pass.pkpass` },
      c.wallet.google && { kind: 'google' as const, href: `/api/public/cards/${serial}/google` },
    ].filter(Boolean) as { kind: 'apple' | 'google'; href: string }[]
  )
    // на iPhone — только Apple, на Android — только Google, на компьютере — обе
    .filter((b) => os === 'other' || (os === 'ios' ? b.kind === 'apple' : b.kind === 'google'));
  const left = c.stampsRequired - c.stampCount;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-bold">{c.salonName}</h1>
        <p className="text-stone-600">{c.customerName}</p>
      </div>

      {buttons.length > 0 && (
        <div className="space-y-2">
          {buttons.map((b) => (
            <WalletButton key={b.kind} {...b} />
          ))}
          <p className="text-center text-xs text-stone-500">{t('public_card.wallet_hint')}</p>
        </div>
      )}

      <CardVisual
        salonName={c.salonName}
        logoUrl={c.logoUrl}
        stampCount={c.stampCount}
        stampsRequired={c.stampsRequired}
        rewardText={c.rewardText}
        rewardsAvailable={c.rewardsAvailable}
        bgColor={c.bgColor}
        fgColor={c.fgColor}
        labelColor={c.labelColor}
        stampShape={c.stampShape}
        stampIcon={c.stampIcon}
        qrUrl={`/api/public/cards/${serial}/qr.svg`}
        nextAppointmentAt={c.nextAppointmentAt}
        timezone={c.timezone}
      />

      <div className="space-y-2 text-center">
        {c.rewardsAvailable > 0 ? (
          <p className="text-lg font-semibold">{t('public_card.reward_ready', { reward: c.rewardText })}</p>
        ) : (
          <p className="font-semibold">{t('public_card.stamps_left', { count: left })}</p>
        )}
        <p className="text-sm text-stone-500">{t('public_card.show_qr')}</p>
        {buttons.length === 0 && <p className="text-xs text-stone-500">{t('public_card.save_page')}</p>}
      </div>

      {c.demo && <DemoPush serial={serial!} used={c.demo.used} hasWallet={buttons.length > 0} />}

      {c.referral && <ReferralShare salonName={c.salonName} {...c.referral} />}

      <SalonActions bookingUrl={c.bookingUrl} reviewUrl={c.reviewUrl} phone={c.salonPhone} />

      <p className="text-center text-xs text-stone-500">
        {t(c.marketing ? 'public_card.marketing_on' : 'public_card.marketing_off')}{' '}
        <button
          type="button"
          className="underline disabled:opacity-50"
          disabled={marketing.isPending}
          onClick={() => marketing.mutate(!c.marketing)}
        >
          {t(c.marketing ? 'public_card.marketing_stop' : 'public_card.marketing_start')}
        </button>
      </p>
    </div>
  );
}

// ───────── /j/:slug/privacy ─────────

export function PrivacyPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const salon = usePublicSalon(slug);
  if (salon.isLoading) return <Spinner />;
  if (salon.error) return <Alert>{t('join.not_found')}</Alert>;
  const s = salon.data!;
  const address = [s.address, s.phone].filter(Boolean).join(', ');
  const vars = { salon: s.name, address: address ? `, ${address}` : '', app: APP_NAME };
  return (
    <article className="space-y-3 text-sm leading-relaxed text-stone-700">
      <h1 className="text-xl font-bold text-stone-900">{t('privacy.title')}</h1>
      {(['p_controller', 'p_data', 'p_purpose', 'p_marketing', 'p_basis', 'p_retention', 'p_rights', 'p_processor'] as const).map((k) => (
        <p key={k}>{t(`privacy.${k}`, vars)}</p>
      ))}
      <Link to={`/j/${slug}`} className="inline-block pt-2 font-semibold underline">
        {t('common.back')}
      </Link>
    </article>
  );
}
