import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { stampStripSvg } from '@stalka/shared';
import { formatDateTime } from '../lib/format';

export interface CardLook {
  salonName: string;
  logoUrl: string | null;
  stampCount: number;
  stampsRequired: number;
  rewardText: string;
  rewardsAvailable?: number;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  stampShape?: string;
  stampIcon?: string;
  qrUrl?: string | null;
  /** следующая запись — показывается на лицевой стороне, как в Wallet */
  nextAppointmentAt?: string | null;
  timezone?: string;
}

/** Штампы — та же SVG, что сервер кладёт в Apple/Google Wallet (stampStripSvg из @stalka/shared). */
function StampStrip(p: { filled: number; total: number; bg: string; fg: string; label: string; shape?: string; icon?: string }) {
  const svg = useMemo(
    () =>
      stampStripSvg(
        { bgColor: p.bg, fgColor: p.fg, labelColor: p.label, stampShape: p.shape, stampIcon: p.icon },
        p.filled,
        p.total,
        375,
        123,
        false,
      ).replace('<svg ', '<svg style="display:block;width:100%;height:auto" '),
    [p.bg, p.fg, p.label, p.shape, p.icon, p.filled, p.total],
  );
  // SVG собран из наших констант и проверенных #RRGGBB-цветов — без пользовательского текста
  return <div role="img" aria-label={`${p.filled}/${p.total}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Карта в стиле Wallet: для превью в настройках и на странице клиентки. */
export function CardVisual(c: CardLook) {
  const { t } = useTranslation();
  return (
    <div
      className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5"
      style={{ backgroundColor: c.bgColor, color: c.fgColor }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
        {c.logoUrl ? (
          <img src={c.logoUrl} alt={c.salonName} className="h-9 max-w-[60%] object-contain object-left" />
        ) : (
          <span className="truncate text-base font-semibold">{c.salonName}</span>
        )}
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.labelColor }}>
            {t('card.stamps')}
          </div>
          <div className="text-lg font-semibold leading-tight">
            {c.stampCount}/{c.stampsRequired}
          </div>
        </div>
      </div>
      <StampStrip
        filled={c.stampCount}
        total={c.stampsRequired}
        bg={c.bgColor}
        fg={c.fgColor}
        label={c.labelColor}
        shape={c.stampShape}
        icon={c.stampIcon}
      />
      <div className="flex items-end justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.labelColor }}>
            {t('card.reward_label', { n: c.stampsRequired })}
          </div>
          <div className="truncate text-sm">{c.rewardText}</div>
        </div>
        {!!c.rewardsAvailable && (
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.labelColor }}>
              {t('card.available')}
            </div>
            <div className="text-sm">🎁 {c.rewardsAvailable}</div>
          </div>
        )}
      </div>
      {c.nextAppointmentAt && (
        <div className="mx-4 mb-3 border-t pt-2.5" style={{ borderColor: `${c.fgColor}33` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: c.labelColor }}>
            {t('card.next_visit')}
          </div>
          <div className="text-base font-semibold">{formatDateTime(c.nextAppointmentAt, c.timezone)}</div>
        </div>
      )}
      {c.qrUrl !== undefined && (
        <div className="flex justify-center pb-5 pt-1">
          <div className="rounded-xl bg-white p-2.5">
            {c.qrUrl ? (
              <img src={c.qrUrl} alt="QR" className="size-40" />
            ) : (
              <div className="grid size-28 place-items-center text-xs text-stone-400">QR</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
