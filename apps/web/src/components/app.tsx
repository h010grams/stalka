import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Gift, type LucideIcon } from 'lucide-react';
import type { CustomerListItem } from '@stalka/shared';

/** Мягкие пастельные фоны для инициалов — цвет стабилен для одного имени. */
const AVATAR_BG = ['#F4D9CF', '#E9DDF3', '#D9EADF', '#F7E6C4', '#DCE6F2', '#F2D7DF'];

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Avatar({ name, size = 38 }: { name: string; size?: number }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full text-[13px] font-bold text-[#57413A]"
      style={{ width: size, height: size, background: AVATAR_BG[h % AVATAR_BG.length] }}
    >
      {initials(name)}
    </span>
  );
}

/** Заголовок страницы кабинета — с засечками, как на лендинге. */
export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-3 text-[30px] leading-tight">{children}</h1>;
}

/** Подпись раздела: «DNES   Všetci». */
export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mx-1 mb-2 flex items-baseline justify-between">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-stone-500">{children}</h2>
      {action}
    </div>
  );
}

/** Награда ждёт — пилюля; иначе «7/10» с полоской прогресса. */
export function StampProgress({ stamps, required, rewards }: { stamps: number; required: number | null; rewards: number }) {
  const { t } = useTranslation();
  if (rewards > 0) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-100 px-2 py-1 text-[11.5px] font-bold text-brand-700">
        <Gift className="size-3.5" aria-hidden /> {t('customers.reward_pill')}
      </span>
    );
  }
  if (!required) return null;
  return (
    <div className="w-[74px] shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-stone-600">
      {stamps}/{required}
      <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-[#F3EAE5]">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (stamps / required) * 100)}%` }} />
      </div>
    </div>
  );
}

/** Строка клиентки в списках: аватар, имя, подпись, прогресс. */
export function CustomerRow({
  c,
  to,
  sub,
  required,
}: {
  c: CustomerListItem;
  to: string;
  sub: ReactNode;
  required: number | null;
}) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-3.5 py-[11px] transition-colors active:bg-stone-50">
        <Avatar name={c.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{c.name}</p>
          <p className="truncate text-[12.5px] text-stone-500">{sub}</p>
        </div>
        <StampProgress stamps={c.stampCount} required={required} rewards={c.rewardsAvailable} />
      </Link>
    </li>
  );
}

/** Строка настроек: цветная иконка, название, значение справа. */
export function SettingsRow({
  icon: Icon,
  color,
  label,
  value,
  to,
  href,
  download,
  onClick,
  danger,
  children,
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value?: ReactNode;
  to?: string;
  href?: string;
  download?: boolean;
  onClick?: () => void;
  danger?: boolean;
  children?: ReactNode;
}) {
  const inner = (
    <>
      <span
        className="grid size-8 shrink-0 place-items-center rounded-[10px]"
        style={danger ? { background: '#FDE8E7', color: '#B42318' } : { background: color, color: '#fff' }}
      >
        <Icon className="size-[17px]" aria-hidden />
      </span>
      <span className={`flex-1 text-[15px] font-semibold ${danger ? 'text-[#B42318]' : ''}`}>{label}</span>
      {children ?? (
        <span className="flex items-center gap-1 text-[13px] text-stone-400">
          {value}
          {(to || href) && <ChevronRight className="size-4" aria-hidden />}
        </span>
      )}
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-stone-50';
  if (to) return <li><Link to={to} className={cls}>{inner}</Link></li>;
  if (href) return <li><a href={href} download={download} className={cls}>{inner}</a></li>;
  if (onClick) return <li><button type="button" onClick={onClick} className={`${cls} cursor-pointer`}>{inner}</button></li>;
  return <li className={cls}>{inner}</li>;
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return <ul className="mb-3 divide-y divide-[#F3EEEA] overflow-hidden rounded-[22px] bg-white shadow-soft">{children}</ul>;
}
