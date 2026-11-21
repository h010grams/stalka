import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LOCALES, updateSalonSchema, type ProgramDto, type SalonDto, type StaffResponse } from '@stalka/shared';
import { api } from '../lib/api';
import { meKey, useCurrentRole, useLogout, useMe } from '../lib/auth';
import { Alert, Button, Card, ErrorAlert, Field, Input, Select, Spinner } from '../components/ui';
import { PlanCard } from '../components/PlanCard';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Avatar, PageTitle, SettingsGroup, SettingsRow } from '../components/app';
import {
  ChevronLeft,
  CreditCard,
  Download,
  Globe,
  Link2,
  LogOut,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';

const LOCALE_NAMES = { sk: 'Slovenčina', en: 'English', uk: 'Українська' } as const;

export function SalonSettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const role = useCurrentRole();
  const isOwner = role === 'OWNER';

  const salon = useQuery({ queryKey: ['salon'], queryFn: () => api.get<SalonDto>('/salon') });
  const form = useForm({ resolver: zodResolver(updateSalonSchema) });

  useEffect(() => {
    if (salon.data) {
      const { name, address, phone, bookingUrl, reviewUrl, defaultLocale } = salon.data;
      form.reset({
        name,
        address: address ?? '',
        phone: phone ?? '',
        bookingUrl: bookingUrl ?? '',
        reviewUrl: reviewUrl ?? '',
        defaultLocale,
      });
    }
  }, [salon.data, form]);

  const save = useMutation({
    mutationFn: (v: unknown) => api.patch<SalonDto>('/salon', v),
    onSuccess: (data) => {
      qc.setQueryData(['salon'], data);
      void qc.invalidateQueries({ queryKey: meKey }); // имя салона в шапке
    },
  });

  if (salon.isLoading) return <Spinner />;
  if (salon.error) return <ErrorAlert error={salon.error} />;
  const { errors } = form.formState;
  const publicUrl = `${window.location.origin}/j/${salon.data!.slug}`;

  return (
    <div className="space-y-5">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
        <ChevronLeft className="size-4" aria-hidden /> {t('nav.settings')}
      </Link>
      <PageTitle>{t('settings.salon_data')}</PageTitle>

      <Card>
        <form className="space-y-4" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
          <fieldset disabled={!isOwner} className="space-y-4">
            <ErrorAlert error={save.error} />
            {save.isSuccess && !form.formState.isDirty && <Alert kind="success">{t('common.saved')}</Alert>}
            <Field label={t('settings.salon_name')} error={errors.name?.message}>
              <Input {...form.register('name')} />
            </Field>
            <Field label={t('settings.address')} error={errors.address?.message}>
              <Input autoComplete="street-address" {...form.register('address')} />
            </Field>
            <Field label={t('settings.phone')} error={errors.phone?.message}>
              <Input type="tel" inputMode="tel" {...form.register('phone')} />
            </Field>
            <div id="links" className="scroll-mt-20 space-y-4 border-t border-stone-200 pt-4">
              <div>
                <h3 className="font-semibold">{t('settings.links')}</h3>
                <p className="text-xs text-stone-500">{t('settings.links_hint')}</p>
              </div>
              <Field label={t('settings.booking_url')} error={errors.bookingUrl?.message}>
                <Input type="url" inputMode="url" placeholder="booksy.com/…" {...form.register('bookingUrl')} />
              </Field>
              <p className="-mt-2 text-xs text-stone-500">{t('settings.booking_url_hint')}</p>
              <Field label={t('settings.review_url')} error={errors.reviewUrl?.message}>
                <Input type="url" inputMode="url" placeholder="g.page/r/…/review" {...form.register('reviewUrl')} />
              </Field>
              <p className="-mt-2 text-xs text-stone-500">{t('settings.review_url_hint')}</p>
            </div>
            <Field label={t('settings.default_locale')}>
              <Select {...form.register('defaultLocale')}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </Select>
            </Field>
            {isOwner && (
              <Button type="submit" className="w-full" loading={save.isPending}>
                {t('common.save')}
              </Button>
            )}
          </fieldset>
        </form>
      </Card>

      <Card className="space-y-1">
        <p className="text-sm text-stone-500">{t('settings.public_link')}</p>
        <p className="break-all font-mono text-sm">{publicUrl}</p>
      </Card>

    </div>
  );
}

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const name = h.split('.')[0] ?? h;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return null;
  }
};

/** Настройки владелицы: подписка, группы разделов, язык и выход. */
export function SettingsPage() {
  const { t } = useTranslation();
  const role = useCurrentRole();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();
  const isOwner = role === 'OWNER';

  const salon = useQuery({ queryKey: ['salon'], queryFn: () => api.get<SalonDto>('/salon') });
  const program = useQuery({ queryKey: ['program'], queryFn: () => api.get<{ program: ProgramDto | null }>('/program') });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api.get<StaffResponse>('/staff'), enabled: isOwner });
  // журнал нужен, только когда штампы ставит больше одного человека
  const team = staff.data?.members.length ?? 0;

  if (!isOwner) return <Navigate to="/profile" replace />;
  if (salon.isLoading) return <Spinner />;
  if (salon.error) return <ErrorAlert error={salon.error} />;
  const s = salon.data!;
  const p = program.data?.program;
  const linkCount = [s.bookingUrl, s.reviewUrl].filter(Boolean).length;

  return (
    <div>
      <PageTitle>{t('nav.settings')}</PageTitle>
      <PlanCard plan={s.plan} />

      <SettingsGroup>
        <SettingsRow
          icon={CreditCard}
          color="#C97B63"
          label={t('nav.program')}
          to="/program"
          value={p ? t('settings.stamps', { count: p.stampsRequired }) : undefined}
        />
        <SettingsRow
          icon={Link2}
          color="#8B6F9E"
          label={t('settings.links_short')}
          to="/settings/salon#links"
          value={hostOf(s.bookingUrl) ?? (linkCount ? String(linkCount) : undefined)}
        />
        <SettingsRow icon={MessageSquare} color="#5E8C6A" label={t('settings.messages')} to="/messages" />
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon={Store} color="#B08968" label={t('settings.salon_data')} to="/settings/salon" />
        <SettingsRow icon={Users} color="#6B7FA8" label={t('nav.staff')} to="/staff" value={team || undefined} />
        <SettingsRow icon={Download} color="#A08A5A" label={t('settings.export')} href="/api/customers/export.csv" download value="CSV" />
        {team > 1 && <SettingsRow icon={ScrollText} color="#78716C" label={t('nav.audit')} to="/audit" />}
        {me?.isAdmin && <SettingsRow icon={ShieldCheck} color="#44403C" label={t('admin.link')} to="/admin" />}
      </SettingsGroup>

      <SettingsGroup>
        <SettingsRow icon={Globe} color="#78716C" label={t('settings.language')}>
          <LanguageSwitcher persist />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup>
        <li className="flex items-center gap-3 px-3.5 py-3">
          <Avatar name={me?.user.name ?? '?'} size={32} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{me?.user.name}</p>
            <p className="truncate text-[12.5px] text-stone-500">{me?.user.email}</p>
          </div>
        </li>
        <SettingsRow
          icon={LogOut}
          color=""
          danger
          label={t('common.logout')}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
        />
      </SettingsGroup>
    </div>
  );
}

/** Профиль мастера: без настроек салона — только кто я, язык и выход. */
export function ProfilePage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const logout = useLogout();
  return (
    <div>
      <PageTitle>{t('nav.profile')}</PageTitle>
      <SettingsGroup>
        <li className="flex items-center gap-3 px-3.5 py-3">
          <Avatar name={me?.user.name ?? '?'} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{me?.user.name}</p>
            <p className="truncate text-[12.5px] text-stone-500">{me?.user.email}</p>
          </div>
        </li>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow icon={Globe} color="#78716C" label={t('settings.language')}>
          <LanguageSwitcher persist />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow
          icon={LogOut}
          color=""
          danger
          label={t('common.logout')}
          onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/login') })}
        />
      </SettingsGroup>
    </div>
  );
}
