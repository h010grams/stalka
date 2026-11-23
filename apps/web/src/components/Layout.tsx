import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse, SalonDto } from '@stalka/shared';
import { api } from '../lib/api';
import { useCurrentRole, useMe, useSetMe } from '../lib/auth';
import { ScanLine, Settings, UserRound, Users } from 'lucide-react';
import { initials } from './app';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Spinner } from './ui';
import { LandingPage } from '../pages/Landing';

/** Оболочка для залогиненных: шапка + нижняя навигация (удобно большим пальцем). */
export function AppLayout() {
  const { t } = useTranslation();
  const { data: me, isLoading } = useMe();
  const role = useCurrentRole();
  const location = useLocation();
  const setMe = useSetMe();
  const qc = useQueryClient();
  // владелице за неделю до конца пробного периода и после него — напоминание сверху
  const salon = useQuery({
    queryKey: ['salon'],
    queryFn: () => api.get<SalonDto>('/salon'),
    enabled: !!me && role === 'OWNER',
  });
  const plan = salon.data?.plan;
  const showPlan = plan && (plan.status === 'expired' || (plan.status === 'trial' && plan.daysLeft <= 7));

  if (isLoading) return <Spinner />;
  // stalka.sk для гостя — продающая страница, а не форма входа
  if (!me && location.pathname === '/') return <LandingPage />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const isOwner = role === 'OWNER';
  // Сканер — круглая кнопка по центру. Слева клиенты, справа настройки (владелица) или профиль (мастер).
  const side = [
    { to: '/customers', label: t('nav.customers'), icon: Users },
    isOwner
      ? { to: '/settings', label: t('nav.settings'), icon: Settings }
      : { to: '/profile', label: t('nav.profile'), icon: UserRound },
  ];

  async function switchSalon(salonId: string) {
    const next = await api.post<MeResponse>('/auth/switch-salon', { salonId });
    qc.clear();
    setMe(next);
  }

  const sideLink = (n: (typeof side)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      className={({ isActive }) =>
        `flex w-24 flex-col items-center gap-0.5 py-1 text-[11.5px] font-semibold transition-colors ${
          isActive ? 'text-brand-700' : 'text-stone-400'
        }`
      }
    >
      <n.icon className="size-[22px]" aria-hidden />
      {n.label}
    </NavLink>
  );

  return (
    <div className="min-h-dvh bg-cream">
      <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-cream/90 px-5 pb-2 pt-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-stone-600">
            <img src="/mark.svg" alt="" className="h-[18px] w-auto shrink-0" />
            {me.salons.length > 1 ? (
              <select
                className="min-w-0 truncate bg-transparent font-semibold"
                value={me.currentSalonId ?? ''}
                onChange={(e) => void switchSalon(e.target.value)}
              >
                {me.salons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate">{me.salons[0]?.name ?? 'Stálka'}</span>
            )}
          </div>
          <Link
            to={isOwner ? '/settings' : '/profile'}
            aria-label={t('nav.profile')}
            className="grid size-[34px] shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-700"
          >
            {initials(me.user.name)}
          </Link>
        </header>

        {showPlan && location.pathname !== '/settings' && (
          <Link
            to="/settings"
            className="mx-5 mt-1 flex items-center justify-between gap-3 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700 ring-1 ring-brand-100"
          >
            <span>
              {plan.status === 'expired' ? t('plan.banner_expired') : t('plan.banner_trial', { count: plan.daysLeft })}
            </span>
            <span className="shrink-0 font-semibold underline">{t('plan.details')}</span>
          </Link>
        )}

        <main className="flex-1 px-5 pb-36 pt-2">
          <Outlet />
        </main>

        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3.5 pb-[max(env(safe-area-inset-bottom),20px)]">
          <div className="pointer-events-auto mx-auto flex h-[70px] max-w-md items-center justify-around rounded-[26px] bg-white/95 shadow-float backdrop-blur">
            {sideLink(side[0]!)}
            <NavLink
              to="/"
              end
              aria-label={t('nav.scan')}
              className="-mt-10 grid size-[66px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#D98B71] to-brand-600 text-white shadow-[0_10px_24px_rgb(181_100_76/0.4)] ring-[6px] ring-cream transition-transform active:scale-95"
            >
              <ScanLine className="size-7" aria-hidden />
            </NavLink>
            {sideLink(side[1]!)}
          </div>
        </nav>
      </div>
    </div>
  );
}

/** Оболочка для публичных страниц (логин, регистрация). */
export function AuthLayout() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <div className="mb-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <img src="/mark.svg" alt="" className="h-6 w-auto" /> Stálka
        </Link>
        <LanguageSwitcher />
      </div>
      <Outlet />
    </div>
  );
}
