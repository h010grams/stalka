import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CounterRegisterResponse, ProgramDto, StaffCardDto, StampResultDto } from '@stalka/shared';
import { CalendarClock, Gift, QrCode, ScanLine, Stamp, Undo2, UserRound } from 'lucide-react';
import { useMe } from '../lib/auth';
import { CardVisual } from '../components/CardVisual';
import { Avatar, SettingsGroup, SettingsRow } from '../components/app';
import { api, ApiError } from '../lib/api';
import { formatDateTime, formatRelative, toLocalInput } from '../lib/format';
import { Button, Card, ErrorAlert, Input, Spinner } from '../components/ui';

type Feedback = { kind: 'success' | 'error' | 'reward'; text: string } | null;

/** После штампа касса сама возвращается к сканеру — следующая клиентка уже ждёт. */
const AUTO_RETURN_SECONDS = 5;

export function StaffCardPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [appt, setAppt] = useState('');
  const [countdown, setCountdown] = useState<number | null>(null);
  // пришли с экрана «Новая клиентка» — сразу показываем QR для добавления карты в Wallet
  const registered = (useLocation().state as { registered?: CounterRegisterResponse } | null)?.registered;
  const [showQr, setShowQr] = useState(!!registered);
  useEffect(() => {
    if (!registered) return;
    setFeedback({
      kind: registered.firstStamp ? 'reward' : 'success',
      text: registered.created
        ? t(registered.firstStamp ? 'newcust.created_stamp' : 'newcust.created')
        : t('newcust.existing'),
    });
  }, [registered, t]);

  const key = ['staff-card', id];
  const card = useQuery({ queryKey: key, queryFn: () => api.get<StaffCardDto>(`/cards/${id}`) });
  // вид карты салона — цвета, форма и значок штампов, как у клиентки в Wallet
  const program = useQuery({ queryKey: ['program'], queryFn: () => api.get<{ program: ProgramDto | null }>('/program') });
  const { data: me } = useMe();
  const c = card.data;

  useEffect(() => {
    setAppt(c?.nextAppointmentAt ? toLocalInput(c.nextAppointmentAt, c.timezone) : '');
  }, [c?.nextAppointmentAt, c?.timezone]);

  // обратный отсчёт до возврата к сканеру
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      navigate('/');
      return;
    }
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, navigate]);
  const stay = () => setCountdown(null);

  const onError = (e: unknown) => {
    const err = e instanceof ApiError ? e : null;
    let text = t(`errors.${err?.code ?? 'internal'}`, { defaultValue: t('errors.internal') });
    if (err?.code === 'cooldown' && typeof err.details?.retryAt === 'string') {
      text = t('staffcard.cooldown', { when: formatDateTime(err.details.retryAt, c?.timezone) });
    }
    setFeedback({ kind: 'error', text });
    setCountdown(null);
    void card.refetch();
  };
  const update = (next: StaffCardDto) => {
    qc.setQueryData(key, next);
    void qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const stamp = useMutation({
    mutationFn: () => api.post<StampResultDto>(`/cards/${id}/stamps`),
    onSuccess: (r) => {
      update(r.card);
      navigator.vibrate?.(r.rewardEarned ? [60, 60, 120] : 60);
      setFeedback(
        r.rewardEarned
          ? { kind: 'reward', text: t('staffcard.reward_earned') }
          : { kind: 'success', text: t('staffcard.stamp_added', { count: r.card.stampCount, n: r.card.stampsRequired }) },
      );
      // если клиентка только что получила награду — не уходим, её можно сразу применить
      setCountdown(r.rewardEarned ? null : AUTO_RETURN_SECONDS);
    },
    onError,
  });
  const redeem = useMutation({
    mutationFn: () => api.post<{ card: StaffCardDto }>(`/cards/${id}/rewards/redeem`),
    onSuccess: (r) => {
      update(r.card);
      setFeedback({ kind: 'success', text: t('staffcard.redeemed') });
      setCountdown(AUTO_RETURN_SECONDS);
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: () => api.post<{ card: StaffCardDto }>(`/cards/${id}/stamps/revoke-last`),
    onSuccess: (r) => {
      update(r.card);
      setFeedback({ kind: 'success', text: t('staffcard.revoked') });
      setCountdown(null);
    },
    onError,
  });
  const saveAppt = useMutation({
    mutationFn: () => api.put<{ card: StaffCardDto }>(`/cards/${id}/appointment`, { startsAt: appt }),
    onSuccess: (r) => {
      update(r.card);
      setFeedback({ kind: 'success', text: t('staffcard.appointment_saved') });
      setCountdown(AUTO_RETURN_SECONDS);
    },
    onError,
  });
  const removeAppt = useMutation({
    mutationFn: () => api.delete<{ card: StaffCardDto }>(`/cards/${id}/appointment`),
    onSuccess: (r) => update(r.card),
    onError,
  });

  if (card.isLoading) return <Spinner />;
  if (card.error || !c) return <ErrorAlert error={card.error} />;
  const busy = stamp.isPending || redeem.isPending || revoke.isPending;
  const p = program.data?.program;
  const salonName = me?.salons.find((x) => x.id === me.currentSalonId)?.name ?? me?.salons[0]?.name ?? '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pb-1">
        <Avatar name={c.customer.name} size={52} />
        <div className="min-w-0">
          <h1 className="truncate text-[26px] leading-tight">{c.customer.name}</h1>
          <p className="truncate text-[13px] text-stone-500">
            {t('staffcard.visits', { count: c.totalVisits })}
            {c.lastStampAt && ` · ${formatRelative(c.lastStampAt)}`}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-[22px] px-4 py-4 text-center text-lg font-semibold ${
            feedback.kind === 'error'
              ? 'bg-red-50 text-red-800'
              : feedback.kind === 'reward'
                ? 'bg-brand-100 text-brand-700'
                : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {feedback.text}
          {countdown !== null && (
            <div className="mt-2 flex items-center justify-center gap-3 text-sm font-normal">
              <span>{t('counter.back_in', { s: countdown })}</span>
              <button className="cursor-pointer font-semibold underline" onClick={stay}>
                {t('counter.stay')}
              </button>
            </div>
          )}
        </div>
      )}

      {showQr && (
        <Card className="space-y-3 text-center">
          <h2 className="text-lg font-semibold">{t('walletqr.title')}</h2>
          <p className="text-sm text-stone-600">{t('walletqr.text')}</p>
          <div className="flex justify-center">
            <img src={`/api/cards/${id}/wallet-qr.svg`} alt="QR" className="size-56 rounded-xl bg-white p-2" />
          </div>
          <Button variant="secondary" className="w-full" onClick={() => setShowQr(false)}>
            {t('walletqr.done')}
          </Button>
        </Card>
      )}

      {/* Награда — первое, что видит администратор: её применяют при оплате */}
      {c.rewardsAvailable > 0 && (
        <section className="space-y-3 rounded-[22px] bg-gradient-to-br from-stone-900 to-[#3b2a24] p-4 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-brand-300">
              <Gift className="size-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-bold uppercase tracking-wider text-brand-300">
                {t('staffcard.reward_ready', { count: c.rewardsAvailable })}
              </p>
              <p className="font-display text-xl leading-tight">{c.rewardText}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm(t('staffcard.redeem_confirm', { reward: c.rewardText })) && redeem.mutate()}
            className="flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand-300 text-lg font-bold text-stone-900 transition active:scale-[0.99] disabled:opacity-50"
          >
            {redeem.isPending && <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {t('counter.redeem_now')}
          </button>
        </section>
      )}

      <section className="space-y-3 rounded-[22px] bg-white p-3 shadow-soft">
        {p ? (
          <CardVisual
            salonName={salonName}
            logoUrl={p.logoUrl}
            stampCount={c.stampCount}
            stampsRequired={c.stampsRequired}
            rewardText={c.rewardText}
            rewardsAvailable={c.rewardsAvailable}
            bgColor={p.bgColor}
            fgColor={p.fgColor}
            labelColor={p.labelColor}
            stampShape={p.stampShape}
            stampIcon={p.stampIcon}
          />
        ) : (
          <p className="py-4 text-center text-4xl font-bold tabular-nums">
            {c.stampCount}
            <span className="text-stone-400"> / {c.stampsRequired}</span>
          </p>
        )}
        <button
          type="button"
          disabled={busy || !!c.nextStampAllowedAt}
          onClick={() => stamp.mutate()}
          className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#D98B71] to-brand-600 text-xl font-bold text-white shadow-[0_10px_24px_rgb(181_100_76/0.3)] transition active:scale-[0.99] disabled:opacity-45 disabled:shadow-none"
        >
          {stamp.isPending ? (
            <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Stamp className="size-6" aria-hidden />
          )}
          {t('staffcard.add_stamp')}
        </button>
        {c.nextStampAllowedAt && (
          <p className="text-center text-sm text-stone-600">
            {t('staffcard.cooldown', { when: formatDateTime(c.nextStampAllowedAt, c.timezone) })}
          </p>
        )}
      </section>

      {/* Любое касание блока записи останавливает автовозврат */}
      <section className="rounded-[22px] bg-white p-4 shadow-soft" onFocusCapture={stay} onPointerDownCapture={stay}>
        <div className="mb-3 flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
            <CalendarClock className="size-[18px]" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold leading-tight">{t('staffcard.appointment')}</h2>
            {c.nextAppointmentAt && (
              <p className="text-[13px] font-medium text-brand-700">{formatDateTime(c.nextAppointmentAt, c.timezone)}</p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Input type="datetime-local" value={appt} onChange={(e) => setAppt(e.target.value)} aria-label={t('staffcard.appointment')} />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" disabled={!appt} loading={saveAppt.isPending} onClick={() => saveAppt.mutate()}>
              {t('staffcard.appointment_save')}
            </Button>
            {c.nextAppointmentAt && (
              <Button variant="danger" loading={removeAppt.isPending} onClick={() => removeAppt.mutate()}>
                {t('staffcard.appointment_remove')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <SettingsGroup>
        <SettingsRow icon={ScanLine} color="#C97B63" label={t('counter.next')} to="/" />
        {!showQr && (
          <SettingsRow
            icon={QrCode}
            color="#6B7FA8"
            label={t('walletqr.show')}
            onClick={() => {
              stay();
              setShowQr(true);
            }}
          />
        )}
        <SettingsRow icon={UserRound} color="#8B6F9E" label={t('staffcard.customer_detail')} to={`/customers/${c.customer.id}`} />
        {c.revocable && (
          <SettingsRow
            icon={Undo2}
            color=""
            danger
            label={t('staffcard.revoke')}
            onClick={() => !busy && window.confirm(t('staffcard.revoke_confirm')) && revoke.mutate()}
          />
        )}
      </SettingsGroup>
    </div>
  );
}
