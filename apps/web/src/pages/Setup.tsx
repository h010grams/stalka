import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Download, ScanLine, Smartphone, UserPlus } from 'lucide-react';
import type { ProgramDto, ProgramInput, SalonDto } from '@stalka/shared';
import { api } from '../lib/api';
import { useCurrentRole } from '../lib/auth';
import { COLOR_PRESETS } from '../lib/presets';
import { CardVisual } from '../components/CardVisual';
import { Button, Card, ErrorAlert, Field, Input, Spinner, buttonClass } from '../components/ui';

const STAMP_OPTIONS = [5, 6, 8, 10, 12];
type Step = 1 | 2 | 3;

/** Мастер первой настройки: награда → вид карты → плакат. Три экрана вместо поиска по настройкам. */
export function SetupPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const role = useCurrentRole();
  const fileRef = useRef<HTMLInputElement>(null);

  const program = useQuery({ queryKey: ['program'], queryFn: () => api.get<{ program: ProgramDto | null }>('/program') });
  const salon = useQuery({ queryKey: ['salon'], queryFn: () => api.get<SalonDto>('/salon') });

  const [step, setStep] = useState<Step>(1);
  const [reward, setReward] = useState('');
  const [stamps, setStamps] = useState(10);
  const [preset, setPreset] = useState(2);
  const [ready, setReady] = useState(false);

  // повторный вход в мастер: подставляем то, что уже настроено
  useEffect(() => {
    if (ready || program.isLoading) return;
    const p = program.data?.program;
    if (p) {
      setReward(p.rewardText);
      setStamps(p.stampsRequired);
      const i = COLOR_PRESETS.findIndex((c) => c.bgColor.toLowerCase() === p.bgColor.toLowerCase());
      if (i >= 0) setPreset(i);
    }
    setReady(true);
  }, [program.isLoading, program.data, ready]);

  const save = useMutation({
    mutationFn: (v: ProgramInput) => api.put<{ program: ProgramDto }>('/program', v),
    onSuccess: (data) => qc.setQueryData(['program'], data),
  });
  const upload = useMutation({
    mutationFn: (f: File) => api.upload<{ program: ProgramDto }>('/program/logo', f),
    onSuccess: (data) => qc.setQueryData(['program'], data),
  });

  if (program.isLoading || salon.isLoading || !ready) return <Spinner />;
  if (role && role !== 'OWNER') return <Navigate to="/" replace />;

  const current = program.data?.program ?? null;
  const colors = COLOR_PRESETS[preset]!;
  const input = (): ProgramInput => ({
    name: current?.name ?? t('wizard.default_name'),
    rewardText: reward.trim(),
    stampsRequired: stamps,
    cooldownHours: current?.cooldownHours ?? 12,
    firstStampOnJoin: current?.firstStampOnJoin ?? true,
    ...colors,
  });
  const saveAndGo = (next: Step) => save.mutate(input(), { onSuccess: () => setStep(next) });
  const slug = salon.data?.slug ?? '';
  const lang = i18n.language;

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5" aria-label={t('wizard.step', { n: step })}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-brand-600' : 'bg-stone-200'}`} />
        ))}
      </div>
      <p className="text-sm text-stone-500">{t('wizard.step', { n: step })}</p>

      <CardVisual
        salonName={salon.data?.name ?? ''}
        logoUrl={current?.logoUrl ?? null}
        stampCount={Math.min(3, stamps)}
        stampsRequired={stamps}
        rewardText={reward.trim() || t('wizard.reward_placeholder')}
        {...colors}
      />

      <ErrorAlert error={save.error ?? upload.error} />

      {step === 1 && (
        <Card className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl">{t('wizard.s1_title')}</h1>
            <p className="text-sm text-stone-600">{t('wizard.s1_text')}</p>
          </div>
          <Field label={t('wizard.reward')}>
            <Input
              value={reward}
              maxLength={60}
              placeholder={t('wizard.reward_placeholder')}
              onChange={(e) => setReward(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setReward(t(`wizard.sug_${n}`))}
                className="min-h-9 cursor-pointer rounded-full bg-stone-100 px-3 text-sm text-stone-700 transition-colors hover:bg-stone-200"
              >
                {t(`wizard.sug_${n}`)}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <span className="text-sm font-medium text-stone-700">{t('wizard.stamps')}</span>
            <div className="grid grid-cols-5 gap-2">
              {STAMP_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={stamps === n}
                  aria-label={t('wizard.stamps_value', { n })}
                  onClick={() => setStamps(n)}
                  className={`min-h-11 cursor-pointer rounded-xl text-base font-semibold ring-1 transition-colors ${
                    stamps === n ? 'bg-stone-900 text-white ring-stone-900' : 'bg-white text-stone-700 ring-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button className="w-full" disabled={!reward.trim()} loading={save.isPending} onClick={() => saveAndGo(2)}>
            {t('wizard.next')}
          </Button>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl">{t('wizard.s2_title')}</h1>
            <p className="text-sm text-stone-600">{t('wizard.s2_text')}</p>
          </div>
          <div className="flex gap-3">
            {COLOR_PRESETS.map((p, i) => (
              <button
                key={p.bgColor}
                type="button"
                aria-label={p.bgColor}
                aria-pressed={preset === i}
                onClick={() => setPreset(i)}
                className={`flex size-11 cursor-pointer items-center justify-center rounded-full ring-1 ring-black/10 ${
                  preset === i ? 'outline-2 outline-offset-2 outline-stone-900' : ''
                }`}
                style={{ backgroundColor: p.bgColor }}
              >
                {preset === i ? (
                  <Check className="size-5" style={{ color: p.labelColor }} aria-hidden />
                ) : (
                  <span className="size-3 rounded-full" style={{ backgroundColor: p.labelColor }} />
                )}
              </button>
            ))}
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
          <Button variant="secondary" className="w-full" loading={upload.isPending} onClick={() => fileRef.current?.click()}>
            {current?.logoUrl ? t('wizard.logo_change') : t('wizard.logo')}
          </Button>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              {t('wizard.back')}
            </Button>
            <Button loading={save.isPending} onClick={() => saveAndGo(3)}>
              {t('wizard.next')}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-2xl">{t('wizard.s3_title')}</h1>
            <p className="text-sm text-stone-600">{t('wizard.s3_text')}</p>
          </div>
          <a
            href={`/api/poster/poster.pdf?size=a4&lang=${lang}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('primary', 'w-full')}
          >
            <Download className="size-4" aria-hidden /> {t('wizard.todo_poster')}
          </a>
          <a href={`/j/${slug}`} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'w-full')}>
            <Smartphone className="size-4" aria-hidden /> {t('wizard.todo_try')}
          </a>
          <Link to="/new-customer" className={buttonClass('secondary', 'w-full')}>
            <UserPlus className="size-4" aria-hidden /> {t('wizard.todo_first')}
          </Link>
          <Link to="/" className="flex items-center justify-center gap-2 pt-1 text-sm font-semibold underline">
            <ScanLine className="size-4" aria-hidden /> {t('wizard.todo_done')}
          </Link>
        </Card>
      )}
    </div>
  );
}
