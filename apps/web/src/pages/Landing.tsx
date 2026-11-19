import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  Gift,
  Globe,
  Megaphone,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { SiteInfoDto } from '@stalka/shared';
import { api } from '../lib/api';
import { CardVisual } from '../components/CardVisual';
import { LanguageSwitcher } from '../components/LanguageSwitcher';

const CTA =
  'inline-flex min-h-12 cursor-pointer items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-semibold transition-colors duration-200';
const CTA_DARK = `${CTA} bg-stone-900 text-white hover:bg-stone-700`;
const CTA_LIGHT = `${CTA} bg-white text-stone-900 ring-1 ring-stone-300 hover:bg-stone-100`;

const FEATURES: { key: string; icon: LucideIcon }[] = [
  { key: 'appt', icon: CalendarClock },
  { key: 'msg', icon: Megaphone },
  { key: 'bday', icon: Gift },
  { key: 'counter', icon: Timer },
  { key: 'gdpr', icon: ShieldCheck },
  { key: 'lang', icon: Globe },
];
const STEPS: LucideIcon[] = [QrCode, WalletCards, ScanLine];

/** Плавное появление блоков при прокрутке; без IntersectionObserver всё видно сразу. */
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.setAttribute('data-shown', ''));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.setAttribute('data-shown', '');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl scroll-mt-20 px-4 py-20 md:py-28 ${className}`}>
      {children}
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{children}</h2>;
}

function Notification() {
  const { t } = useTranslation();
  return (
    <div className="flex gap-3 rounded-2xl bg-white/85 p-3 shadow-sm ring-1 ring-black/5 backdrop-blur">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white">
        <WalletCards className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="flex justify-between gap-2 font-semibold">
          Wallet <span className="font-normal text-stone-500">{t('landing.notif_time')}</span>
        </p>
        <p className="text-stone-700">{t('landing.notif_text')}</p>
      </div>
    </div>
  );
}

/** Продающая страница: stalka.sk для тех, кто не вошёл. */
export function LandingPage() {
  const { t } = useTranslation();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api.get<SiteInfoDto>('/public/site'), staleTime: Infinity });
  const demo = site.data?.demo ?? null;
  const contact = site.data?.contactEmail ?? null;
  useReveal();

  return (
    <div className="min-h-dvh bg-cream text-stone-900">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-cream/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold">
            <img src="/mark.svg" alt="" className="h-7 w-auto" /> Stálka
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-stone-600 md:flex">
            {(['how', 'features', 'price', 'faq'] as const).map((k) => (
              <a key={k} href={`#${k}`} className="transition-colors hover:text-stone-900">
                {t(`landing.nav_${k}`)}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-semibold hover:underline">
              {t('landing.login')}
            </Link>
            <Link
              to="/register"
              className="hidden min-h-10 items-center rounded-full bg-stone-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-700 lg:inline-flex"
            >
              {t('landing.cta')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── Hero: заголовок по центру и веер карт разных заведений ───────── */}
        <section className="mx-auto max-w-6xl overflow-x-clip px-4 pb-16 pt-14 text-center md:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-stone-600 ring-1 ring-stone-200">
            <Sparkles className="size-4 text-brand-600" aria-hidden />
            {t('landing.eyebrow')}
          </p>
          <h1 className="mx-auto mt-6 max-w-5xl font-display text-5xl leading-[1.02] tracking-tight sm:text-6xl md:text-[5.5rem]">
            {t('landing.title_a')} <em className="font-medium text-brand-600">{t('landing.title_b')}</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600 md:text-xl">{t('landing.lead_short')}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
            <Link to="/register" className={CTA_DARK}>
              {t('landing.cta')}
            </Link>
            {demo && (
              <a href="#demo" className={CTA_LIGHT}>
                {t('landing.cta_demo')}
              </a>
            )}
          </div>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-stone-600">
            {(
              [
                [Smartphone, 'trust_wallet'],
                [WalletCards, 'trust_noapp'],
                [ShieldCheck, 'trust_gdpr'],
                [Timer, 'trust_setup'],
              ] as const
            ).map(([Icon, key]) => (
              <li key={key} className="flex items-center gap-1.5">
                <Icon className="size-4 text-brand-600" aria-hidden />
                {t(`landing.${key}`)}
              </li>
            ))}
          </ul>

          <div className="relative mx-auto mt-14 flex max-w-5xl items-start justify-center lg:h-[330px]">
            <div className="absolute -inset-x-10 top-10 -z-10 h-64 rounded-full bg-brand-300/30 blur-3xl" aria-hidden />
            {/* боковые карты — только на широком экране, на телефоне хватает одной */}
            <div className="absolute left-[4%] top-12 hidden w-[330px] -rotate-[8deg] text-left lg:block">
              <CardVisual
                salonName="Barber 41"
                logoUrl={null}
                stampCount={3}
                stampsRequired={10}
                rewardText={t('landing.demo_reward_barber')}
                bgColor="#1C1917"
                fgColor="#FFFFFF"
                labelColor="#E7B9A8"
              />
            </div>
            <div className="absolute right-[4%] top-12 hidden w-[330px] rotate-[8deg] text-left lg:block">
              <CardVisual
                salonName="Káva u Evy"
                logoUrl={null}
                stampCount={8}
                stampsRequired={10}
                rewardText={t('landing.demo_reward_cafe')}
                bgColor="#1F3A34"
                fgColor="#FFFFFF"
                labelColor="#C9DCC8"
              />
            </div>
            <div className="relative z-10 w-full max-w-[340px] rounded-2xl text-left shadow-2xl shadow-stone-900/25">
              <CardVisual
                salonName="Stálka Demo"
                logoUrl={null}
                stampCount={6}
                stampsRequired={10}
                rewardText={t('landing.demo_reward')}
                bgColor="#7A1F3D"
                fgColor="#FFFFFF"
                labelColor="#F4C7D3"
              />
            </div>
          </div>
        </section>

        {/* ───────── Бумага против Stálka ───────── */}
        <div className="border-y border-stone-200 bg-white">
          <Section>
            <div data-reveal>
              <Heading>{t('landing.vs_title')}</Heading>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              <div data-reveal className="rounded-3xl bg-stone-100 p-7">
                <h3 className="mb-4 font-semibold text-stone-500">{t('landing.vs_paper')}</h3>
                <ul className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <li key={n} className="flex gap-3 text-stone-600">
                      <X className="mt-0.5 size-5 shrink-0 text-stone-400" aria-hidden />
                      {t(`landing.vs_paper_${n}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div data-reveal className="rounded-3xl bg-stone-900 p-7 text-white">
                <h3 className="mb-4 font-semibold">{t('landing.vs_stalka')}</h3>
                <ul className="space-y-3">
                  {[1, 2, 3, 4].map((n) => (
                    <li key={n} className="flex gap-3">
                      <Check className="mt-0.5 size-5 shrink-0 text-brand-300" aria-hidden />
                      {t(`landing.vs_stalka_${n}`)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Section>
        </div>

        {/* ───────── Как это работает ───────── */}
        <Section id="how">
          <div data-reveal>
            <Heading>{t('landing.how_title')}</Heading>
          </div>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {STEPS.map((Icon, i) => (
              <li key={i} data-reveal className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <span className="font-display text-3xl text-stone-300">0{i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold">{t(`landing.how_${i + 1}_t`)}</h3>
                <p className="leading-relaxed text-stone-600">{t(`landing.how_${i + 1}`)}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* ───────── Функции ───────── */}
        <div className="bg-white">
          <Section id="features">
            <div data-reveal>
              <Heading>{t('landing.feat_title')}</Heading>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {/* главная функция — крупно */}
              <div
                data-reveal
                className="flex flex-col justify-between gap-6 rounded-3xl bg-brand-50 p-7 ring-1 ring-brand-100 md:col-span-2 md:row-span-2"
              >
                <div className="space-y-2">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-white text-brand-700 ring-1 ring-brand-100">
                    <Bell className="size-5" aria-hidden />
                  </span>
                  <h3 className="pt-2 font-display text-2xl font-semibold">{t('landing.f_winback_t')}</h3>
                  <p className="max-w-lg leading-relaxed text-stone-700">{t('landing.f_winback')}</p>
                </div>
                <div className="max-w-md">
                  <Notification />
                </div>
              </div>
              {FEATURES.map(({ key, icon: Icon }) => (
                <div key={key} data-reveal className="space-y-2 rounded-3xl bg-cream p-6 ring-1 ring-stone-200">
                  <Icon className="size-6 text-brand-600" aria-hidden />
                  <h3 className="pt-1 font-semibold">{t(`landing.f_${key}_t`)}</h3>
                  <p className="text-sm leading-relaxed text-stone-600">{t(`landing.f_${key}`)}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ───────── Демо ───────── */}
        {demo && (
          <div id="demo" className="scroll-mt-16 bg-stone-900 text-white">
            <Section className="grid items-center gap-10 md:grid-cols-[1fr_auto]">
              <div data-reveal className="space-y-4">
                <Heading>{t('landing.demo_title')}</Heading>
                <p className="max-w-xl text-lg text-stone-300">{t('landing.demo_text')}</p>
                <a href={demo.joinPath} className={`${CTA} bg-white text-stone-900 hover:bg-stone-200 md:hidden`}>
                  {t('landing.demo_open')}
                </a>
              </div>
              {/* на компьютере удобнее навести телефон на QR */}
              <div data-reveal className="hidden space-y-3 text-center md:block">
                <img src="/api/public/demo-qr.svg" alt="QR" className="size-48 rounded-3xl bg-white p-4" />
                <p className="text-sm text-stone-400">{t('landing.demo_scan')}</p>
              </div>
            </Section>
          </div>
        )}

        {/* ───────── Цена ───────── */}
        <Section id="price">
          <div data-reveal className="text-center">
            <Heading>{t('landing.price_title')}</Heading>
          </div>
          <div
            data-reveal
            className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-stone-900/5 ring-1 ring-stone-200 md:grid md:grid-cols-2"
          >
            <div className="space-y-3 p-8 md:p-10">
              <span className="inline-block rounded-xl bg-brand-100 px-3 py-1.5 text-sm font-semibold text-brand-700">
                {t('landing.trial')}
              </span>
              <p className="pt-2">
                <span className="font-display text-6xl font-semibold tracking-tight">14,90 €</span>{' '}
                <span className="text-stone-500">{t('landing.per_month')}</span>
              </p>
              <p className="text-stone-600">{t('landing.price_year')}</p>
              <Link to="/register" className={`${CTA_DARK} mt-4 w-full`}>
                {t('landing.cta')}
              </Link>
              <p className="text-center text-sm text-stone-500">{t('landing.cancel')}</p>
            </div>
            <ul className="space-y-3 bg-stone-50 p-8 md:p-10">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n} className="flex gap-3 text-stone-700">
                  <Check className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
                  {t(`landing.inc_${n}`)}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* ───────── Вопросы ───────── */}
        <div className="border-t border-stone-200 bg-white">
          <Section id="faq" className="max-w-3xl">
            <div data-reveal>
              <Heading>{t('landing.faq_title')}</Heading>
            </div>
            <div className="mt-10 divide-y divide-stone-200 border-y border-stone-200">
              {[1, 2, 3, 4, 5].map((n) => (
                <details key={n} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                    {t(`landing.faq_${n}_q`)}
                    <ChevronDown
                      className="size-5 shrink-0 text-stone-400 transition-transform duration-200 group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <p className="pt-3 leading-relaxed text-stone-600">{t(`landing.faq_${n}_a`)}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>

        {/* ───────── Пилот и финальный призыв ───────── */}
        <Section>
          <div data-reveal className="relative overflow-hidden rounded-[2rem] bg-brand-700 px-8 py-14 text-white md:px-14">
            <div className="absolute -right-16 -top-16 size-64 rounded-full bg-white/10" aria-hidden />
            <div className="relative max-w-2xl space-y-4">
              <h2 className="font-display text-3xl font-semibold md:text-4xl">{t('landing.final_title')}</h2>
              <p className="text-lg text-white/90">{t('landing.final_text')}</p>
              <p className="text-white/90">
                <strong className="text-white">{t('landing.pilot_title')}.</strong> {t('landing.pilot_text')}
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Link to="/register" className={`${CTA} bg-white text-stone-900 hover:bg-stone-100`}>
                  {t('landing.pilot_cta')}
                </Link>
                {contact && (
                  <a href={`mailto:${contact}`} className={`${CTA} ring-1 ring-white/60 hover:bg-white/10`}>
                    {t('landing.pilot_write')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </Section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-stone-200 px-4 py-8 text-sm text-stone-500">
        <span className="flex items-center gap-2">
          <img src="/mark.svg" alt="" className="h-5 w-auto" /> Stálka · {t('landing.footer')}
        </span>
        <Link to="/login" className="hover:underline">
          {t('landing.login')}
        </Link>
      </footer>
    </div>
  );
}
