import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Gift, Minus, Palette, Plus, Printer, ShieldCheck, type LucideIcon } from 'lucide-react';
import {
  programSchema,
  stampStripSvg,
  STAMP_ICONS,
  STAMP_SHAPES,
  type ProgramDto,
  type SalonDto,
  type StampIcon,
  type StampShape,
} from '@stalka/shared';
import { api } from '../lib/api';
import { useCurrentRole } from '../lib/auth';
import { CardVisual } from '../components/CardVisual';
import { PageTitle } from '../components/app';
import { COLOR_PRESETS } from '../lib/presets';
import { Alert, Button, ErrorAlert, Field, Input, Spinner, buttonClass } from '../components/ui';

const DEFAULTS = {
  name: 'Vernostná karta',
  stampsRequired: 10,
  rewardText: '',
  cooldownHours: 12,
  firstStampOnJoin: true,
  winbackEnabled: true,
  rewardReminderEnabled: true,
  birthdayEnabled: true,
  reviewRequestEnabled: true,
  referralEnabled: false,
  referralBonus: 1,
  birthdayGift: '' as string | null,
  bgColor: '#1C1917',
  fgColor: '#FFFFFF',
  labelColor: '#E7B9A8',
  stampShape: 'circle' as StampShape,
  stampIcon: 'check' as StampIcon,
};

const QUICK_STAMPS = [6, 8, 10, 12];

/** Раздел страницы: белая карточка с иконкой в заголовке. */
function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-[22px] bg-white p-4 shadow-soft">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-semibold leading-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Переключатель вместо галочки: подпись слева, тумблер справа. */
function Toggle({ reg, title, hint, children }: { reg: UseFormRegisterReturn; title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="border-t border-[#F3EEEA] pt-3 first:border-t-0 first:pt-0">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{title}</span>
          {hint && <span className="mt-0.5 block text-xs text-stone-500">{hint}</span>}
        </span>
        <input type="checkbox" className="peer sr-only" {...reg} />
        <span
          aria-hidden
          className="relative mt-0.5 h-7 w-12 shrink-0 rounded-full bg-stone-200 transition-colors after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-brand-500 peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40"
        />
      </label>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Один штамп для плитки выбора формы/значка — тот же рисунок, что на карте. */
function StampTile({ colors, shape, icon }: { colors: { bg: string; fg: string; label: string }; shape: string; icon: string }) {
  const svg = useMemo(
    () =>
      stampStripSvg({ bgColor: colors.bg, fgColor: colors.fg, labelColor: colors.label, stampShape: shape, stampIcon: icon }, 1, 1, 60, 60).replace(
        '<svg ',
        '<svg style="display:block;width:100%;height:100%" ',
      ),
    [colors.bg, colors.fg, colors.label, shape, icon],
  );
  // один заполненный штамп; SVG собран из наших констант и проверенных цветов
  return <div className="size-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function Choice({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      title={label}
      onClick={onClick}
      className={`relative aspect-square cursor-pointer overflow-hidden rounded-2xl transition ${
        selected ? 'ring-2 ring-brand-500 ring-offset-2' : 'ring-1 ring-black/5 hover:ring-black/15'
      }`}
    >
      {children}
    </button>
  );
}

export function ProgramPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isOwner = useCurrentRole() === 'OWNER';
  const fileRef = useRef<HTMLInputElement>(null);

  const program = useQuery({ queryKey: ['program'], queryFn: () => api.get<{ program: ProgramDto | null }>('/program') });
  const salon = useQuery({ queryKey: ['salon'], queryFn: () => api.get<SalonDto>('/salon') });
  const form = useForm({ resolver: zodResolver(programSchema), defaultValues: DEFAULTS });
  const values = useWatch({ control: form.control });

  useEffect(() => {
    const p = program.data?.program;
    if (p) {
      const { id: _id, logoUrl: _l, ...rest } = p;
      form.reset(rest);
    }
  }, [program.data, form]);

  const setProgram = (data: { program: ProgramDto }) => qc.setQueryData(['program'], data);
  const save = useMutation({ mutationFn: (v: unknown) => api.put<{ program: ProgramDto }>('/program', v), onSuccess: setProgram });
  const upload = useMutation({ mutationFn: (f: File) => api.upload<{ program: ProgramDto }>('/program/logo', f), onSuccess: setProgram });
  const removeLogo = useMutation({ mutationFn: () => api.delete<{ program: ProgramDto }>('/program/logo'), onSuccess: setProgram });

  if (program.isLoading || salon.isLoading) return <Spinner />;
  const current = program.data?.program ?? null;
  const { errors, isDirty } = form.formState;
  const lang = i18n.language;
  const set = <K extends keyof typeof DEFAULTS>(k: K, v: (typeof DEFAULTS)[K]) =>
    form.setValue(k as never, v as never, { shouldDirty: true, shouldValidate: true });
  const stamps = Math.min(30, Math.max(2, Number(values.stampsRequired) || 2));
  const colors = {
    bg: values.bgColor ?? DEFAULTS.bgColor,
    fg: values.fgColor ?? DEFAULTS.fgColor,
    label: values.labelColor ?? DEFAULTS.labelColor,
  };
  const showSave = isOwner && (!current || isDirty);

  return (
    <div>
      <PageTitle>{t('program.title')}</PageTitle>

      {/* Превью всегда на виду, пока листаешь настройки */}
      <div className="sticky top-14 z-[5] -mx-5 bg-cream/95 px-5 pb-3 pt-1 backdrop-blur">
        <CardVisual
          salonName={salon.data?.name ?? ''}
          logoUrl={current?.logoUrl ?? null}
          stampCount={Math.min(3, stamps - 1)}
          stampsRequired={stamps}
          rewardText={values.rewardText || t('program.reward_placeholder')}
          bgColor={colors.bg}
          fgColor={colors.fg}
          labelColor={colors.label}
          stampShape={values.stampShape}
          stampIcon={values.stampIcon}
        />
      </div>

      <form className="space-y-3" onSubmit={form.handleSubmit((v) => save.mutate(v))} noValidate>
        <fieldset disabled={!isOwner} className="space-y-3">
          <ErrorAlert error={save.error} />
          {save.isSuccess && !isDirty && <Alert kind="success">{t('common.saved')}</Alert>}

          <Section icon={Gift} title={t('program.section_reward')}>
            <Field label={t('program.reward_text')} error={errors.rewardText?.message}>
              <Input placeholder={t('program.reward_placeholder')} {...form.register('rewardText')} />
            </Field>
            <div className="space-y-2">
              <span className="text-sm font-medium text-stone-700">{t('program.stamps_required')}</span>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  aria-label="−1"
                  onClick={() => set('stampsRequired', Math.max(2, stamps - 1))}
                  className="grid size-11 cursor-pointer place-items-center rounded-2xl bg-stone-100 active:bg-stone-200"
                >
                  <Minus className="size-5" aria-hidden />
                </button>
                <span className="min-w-12 text-center text-3xl font-bold tabular-nums">{stamps}</span>
                <button
                  type="button"
                  aria-label="+1"
                  onClick={() => set('stampsRequired', Math.min(30, stamps + 1))}
                  className="grid size-11 cursor-pointer place-items-center rounded-2xl bg-stone-100 active:bg-stone-200"
                >
                  <Plus className="size-5" aria-hidden />
                </button>
                <div className="flex w-full gap-1.5">
                  {QUICK_STAMPS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => set('stampsRequired', n)}
                      className={`min-h-9 flex-1 cursor-pointer rounded-full px-2 text-sm font-semibold ${
                        stamps === n ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-inset ring-[#EDE5E0]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {errors.stampsRequired?.message && <p className="text-sm text-red-600">{t(errors.stampsRequired.message)}</p>}
            </div>
          </Section>

          <Section icon={Palette} title={t('program.section_look')} hint={t('program.resync_note')}>
            <div className="space-y-2">
              <span className="text-sm font-medium text-stone-700">{t('program.colors')}</span>
              <div className="grid grid-cols-8 gap-2">
                {COLOR_PRESETS.map((p) => {
                  const on = p.bgColor === colors.bg && p.fgColor === colors.fg && p.labelColor === colors.label;
                  return (
                    <button
                      key={p.bgColor + p.labelColor}
                      type="button"
                      aria-label={p.name}
                      title={p.name}
                      aria-pressed={on}
                      onClick={() => {
                        set('bgColor', p.bgColor);
                        set('fgColor', p.fgColor);
                        set('labelColor', p.labelColor);
                      }}
                      className={`grid aspect-square cursor-pointer place-items-center rounded-full ${
                        on ? 'ring-2 ring-brand-500 ring-offset-2' : 'ring-1 ring-black/10'
                      }`}
                      style={{ backgroundColor: p.bgColor }}
                    >
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: p.labelColor }} />
                    </button>
                  );
                })}
              </div>
              <details className="pt-1">
                <summary className="cursor-pointer text-sm text-stone-500">{t('program.more_colors')}</summary>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {(['bgColor', 'fgColor', 'labelColor'] as const).map((k) => (
                    <label key={k} className="space-y-1 text-xs text-stone-600">
                      <span>{t(`program.${k === 'bgColor' ? 'bg' : k === 'fgColor' ? 'fg' : 'label'}`)}</span>
                      <input
                        type="color"
                        className="h-11 w-full cursor-pointer rounded-xl border border-stone-200 bg-white p-1"
                        value={values[k] ?? '#000000'}
                        onChange={(e) => set(k, e.target.value.toUpperCase())}
                      />
                    </label>
                  ))}
                </div>
              </details>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-stone-700">{t('program.shape')}</span>
              <div className="grid grid-cols-5 gap-2">
                {STAMP_SHAPES.map((s) => (
                  <Choice key={s} selected={values.stampShape === s} label={t(`program.shapes.${s}`)} onClick={() => set('stampShape', s)}>
                    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: colors.bg }}>
                      <StampTile colors={colors} shape={s} icon={values.stampIcon ?? 'check'} />
                    </div>
                  </Choice>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-stone-700">{t('program.icon')}</span>
              <div className="grid grid-cols-6 gap-2">
                {STAMP_ICONS.map((ic) => (
                  <Choice key={ic} selected={values.stampIcon === ic} label={t(`program.icons.${ic}`)} onClick={() => set('stampIcon', ic)}>
                    <div className="absolute inset-0 overflow-hidden" style={{ backgroundColor: colors.bg }}>
                      <StampTile colors={colors} shape={values.stampShape ?? 'circle'} icon={ic} />
                    </div>
                  </Choice>
                ))}
              </div>
            </div>

            {isOwner && (
              <div className="space-y-2 border-t border-[#F3EEEA] pt-3">
                <span className="text-sm font-medium text-stone-700">{t('program.logo')}</span>
                {!current ? (
                  <p className="text-sm text-stone-500">{t('program.create_first')}</p>
                ) : (
                  <>
                    <ErrorAlert error={upload.error ?? removeLogo.error} />
                    <div className="flex items-center gap-3">
                      <div className="grid h-14 w-24 shrink-0 place-items-center rounded-xl p-2" style={{ backgroundColor: colors.bg }}>
                        {current.logoUrl ? (
                          <img src={current.logoUrl} alt="" className="max-h-10 max-w-full" />
                        ) : (
                          <span className="text-[11px]" style={{ color: colors.fg }}>
                            —
                          </span>
                        )}
                      </div>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload.mutate(f);
                          e.target.value = '';
                        }}
                      />
                      <Button variant="secondary" className="flex-1" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                        {t('program.logo_upload')}
                      </Button>
                      {current.logoUrl && (
                        <Button variant="danger" loading={removeLogo.isPending} onClick={() => removeLogo.mutate()}>
                          {t('program.logo_remove')}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-stone-500">{t('program.logo_hint')}</p>
                  </>
                )}
              </div>
            )}
          </Section>

          <Section icon={ShieldCheck} title={t('program.section_rules')}>
            <Toggle reg={form.register('firstStampOnJoin')} title={t('program.first_stamp')} hint={t('program.first_stamp_hint')} />
            <Field label={t('program.cooldown')} error={errors.cooldownHours?.message}>
              <Input type="number" inputMode="numeric" min={0} max={168} {...form.register('cooldownHours')} />
            </Field>
            <p className="-mt-2 text-xs text-stone-500">{t('program.cooldown_hint')}</p>
            <Field label={t('program.name')} error={errors.name?.message}>
              <Input {...form.register('name')} />
            </Field>
          </Section>

          <Section icon={Bell} title={t('program.automations')} hint={t('program.automations_hint')}>
            <div className="space-y-3">
              <Toggle reg={form.register('winbackEnabled')} title={t('program.winback')} hint={t('program.winback_hint')} />
              <Toggle
                reg={form.register('rewardReminderEnabled')}
                title={t('program.reward_reminder')}
                hint={t('program.reward_reminder_hint')}
              />
              <Toggle reg={form.register('birthdayEnabled')} title={t('program.birthday')} hint={t('program.birthday_hint')}>
                {values.birthdayEnabled && (
                  <Field label={t('program.birthday_gift')} error={errors.birthdayGift?.message}>
                    <Input placeholder={t('program.birthday_gift_placeholder')} {...form.register('birthdayGift')} />
                  </Field>
                )}
              </Toggle>
              <Toggle reg={form.register('reviewRequestEnabled')} title={t('program.review')} hint={t('program.review_hint')}>
                {values.reviewRequestEnabled && !salon.data?.reviewUrl && (
                  <Link to="/settings/links" className="text-xs font-medium text-amber-700 underline">
                    {t('program.review_needs_link')}
                  </Link>
                )}
              </Toggle>
              <Toggle reg={form.register('referralEnabled')} title={t('program.referral')} hint={t('program.referral_hint')}>
                {values.referralEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-stone-600">{t('program.referral_bonus')}</span>
                    <div className="ml-auto flex gap-1.5">
                      {[1, 2, 3].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => set('referralBonus', n)}
                          className={`min-h-9 min-w-11 cursor-pointer rounded-full px-3 text-sm font-semibold ${
                            Number(values.referralBonus) === n
                              ? 'bg-stone-900 text-white'
                              : 'bg-white text-stone-600 ring-1 ring-inset ring-[#EDE5E0]'
                          }`}
                        >
                          +{n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Toggle>
            </div>
          </Section>

          {showSave && (
            <div className="sticky bottom-[104px] z-10 pt-1">
              <Button type="submit" className="min-h-12 w-full text-base shadow-float" loading={save.isPending}>
                {current ? t('program.save_changes') : t('program.create')}
              </Button>
            </div>
          )}
        </fieldset>
      </form>

      {current && salon.data && (
        <div className="mt-3">
          <Section icon={Printer} title={t('poster.title')} hint={t('poster.text')}>
            <div className="grid gap-2">
              <a
                href={`/api/poster/poster.pdf?size=a4&lang=${lang}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClass('primary', 'w-full')}
              >
                {t('poster.download')}
              </a>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`/api/poster/poster.pdf?size=a5&lang=${lang}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass('secondary', 'w-full')}
                >
                  {t('poster.a5')}
                </a>
                <a href="/api/poster/qr.png" download className={buttonClass('secondary', 'w-full')}>
                  {t('poster.qr_png')}
                </a>
              </div>
              <a href={`/j/${salon.data.slug}`} target="_blank" rel="noreferrer" className="pt-1 text-center text-sm underline">
                {t('poster.open_public')}
              </a>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
