import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import type { SiteInfoDto } from '@stalka/shared';
import { api } from '../lib/api';
import { CardVisual } from '../components/CardVisual';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { buttonClass } from '../components/ui';

const FEATURES = ['winback', 'appt', 'wallet', 'msg', 'bday', 'counter', 'gdpr', 'lang'] as const;

/** Продающая страница: stalka.sk для тех, кто не вошёл. */
export function LandingPage() {
  const { t } = useTranslation();
  const site = useQuery({ queryKey: ['site'], queryFn: () => api.get<SiteInfoDto>('/public/site'), staleTime: Infinity });
  const demo = site.data?.demo ?? null;
  const contact = site.data?.contactEmail ?? null;
  // демо-карта с записью через три дня — как у настоящей клиентки
  const nextVisit = new Date(Date.now() + 3 * 24 * 3600_000);
  nextVisit.setHours(14, 30, 0, 0);

  return (
    <div className="min-h-dvh bg-stone-50 text-stone-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <span className="flex items-center gap-2 text-lg font-bold">
          <img src="/mark.svg" alt="" className="h-7 w-auto" /> Stálka
        </span>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm font-semibold underline">
            {t('landing.login')}
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-16 pt-6 md:grid-cols-[1.15fr_1fr] md:pt-12">
          <div className="space-y-5">
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">{t('landing.title')}</h1>
            <p className="text-lg text-stone-600">{t('landing.lead')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className={buttonClass('primary', 'min-h-12 px-6 text-base')}>
                {t('landing.cta')}
              </Link>
              {demo && (
                <a href="#demo" className={buttonClass('secondary', 'min-h-12 px-6 text-base')}>
                  {t('landing.cta_demo')}
                </a>
              )}
            </div>
            <p className="text-sm text-stone-500">{t('landing.for_whom')}</p>
          </div>
          <div className="mx-auto w-full max-w-sm">
            <CardVisual
              salonName="Zaneta Nail Studio"
              logoUrl={null}
              stampCount={3}
              stampsRequired={10}
              rewardText={t('landing.demo_reward')}
              bgColor="#7A1F3D"
              fgColor="#FFFFFF"
              labelColor="#F4C7D3"
              nextAppointmentAt={nextVisit.toISOString()}
              timezone="Europe/Bratislava"
            />
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="mb-8 text-2xl font-bold">{t('landing.how_title')}</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {([1, 2, 3] as const).map((n) => (
                <li key={n} className="space-y-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                    {n}
                  </span>
                  <h3 className="font-semibold">{t(`landing.how_${n}_t`)}</h3>
                  <p className="text-sm text-stone-600">{t(`landing.how_${n}`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="mb-8 text-2xl font-bold">{t('landing.feat_title')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f} className="space-y-1.5 rounded-2xl border border-stone-200 bg-white p-5">
                <h3 className="font-semibold">{t(`landing.f_${f}_t`)}</h3>
                <p className="text-sm text-stone-600">{t(`landing.f_${f}`)}</p>
              </div>
            ))}
          </div>
        </section>

        {demo && (
          <section id="demo" className="bg-stone-900 text-white">
            <div className="mx-auto grid max-w-5xl items-center gap-8 px-4 py-14 md:grid-cols-[1fr_auto]">
              <div className="space-y-3">
                <h2 className="text-2xl font-bold">{t('landing.demo_title')}</h2>
                <p className="text-stone-300">{t('landing.demo_text')}</p>
                <a href={demo.joinPath} className={buttonClass('secondary', 'min-h-12 px-6 text-base md:hidden')}>
                  {t('landing.demo_open')}
                </a>
              </div>
              {/* на компьютере удобнее навести телефон на QR */}
              <div className="hidden space-y-2 text-center md:block">
                <img src="/api/public/demo-qr.svg" alt="" className="size-44 rounded-2xl bg-white p-3" />
                <p className="text-xs text-stone-400">{t('landing.demo_scan')}</p>
              </div>
            </div>
          </section>
        )}

        <section className="mx-auto max-w-5xl px-4 pt-14">
          <h2 className="mb-6 text-2xl font-bold">{t('landing.price_title')}</h2>
          <div className="grid gap-6 rounded-3xl border border-stone-200 bg-white p-8 md:grid-cols-2 md:p-10">
            <div className="space-y-2">
              <p>
                <span className="text-5xl font-bold tracking-tight">14,90 €</span>{' '}
                <span className="text-stone-500">{t('landing.per_month')}</span>
              </p>
              <p className="text-stone-600">{t('landing.price_year')}</p>
              <p className="pt-2 font-semibold">{t('landing.trial')}</p>
              <p className="text-sm text-stone-500">{t('landing.cancel')}</p>
              <Link to="/register" className={buttonClass('primary', 'mt-3 min-h-12 px-6 text-base')}>
                {t('landing.cta')}
              </Link>
            </div>
            <ul className="space-y-2 self-center text-stone-700">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <li key={n} className="flex gap-2">
                  <span className="text-brand-600">✓</span>
                  {t(`landing.inc_${n}`)}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14">
          <div className="space-y-4 rounded-3xl bg-brand-50 p-8 ring-1 ring-brand-100 md:p-10">
            <h2 className="text-2xl font-bold">{t('landing.pilot_title')}</h2>
            <p className="max-w-2xl text-stone-700">{t('landing.pilot_text')}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/register" className={buttonClass('primary', 'min-h-12 px-6 text-base')}>
                {t('landing.pilot_cta')}
              </Link>
              {contact && (
                <a href={`mailto:${contact}`} className={buttonClass('secondary', 'min-h-12 px-6 text-base')}>
                  {t('landing.pilot_write')}
                </a>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-5xl justify-between gap-3 px-4 pb-10 text-sm text-stone-500">
        <span>Stálka · {t('landing.footer')}</span>
        <Link to="/login" className="underline">
          {t('landing.login')}
        </Link>
      </footer>
    </div>
  );
}
