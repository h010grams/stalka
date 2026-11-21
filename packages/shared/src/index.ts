import { z } from 'zod';
import { STAMP_ICONS, STAMP_SHAPES, type StampIcon, type StampShape } from './stamps.js';

export * from './stamps.js';

// Сообщения валидации — это ключи i18n (`v.*`), фронт переводит их сам.

export const LOCALES = ['sk', 'en', 'uk'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const ROLES = ['OWNER', 'STAFF'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

const email = z.string().trim().toLowerCase().max(254).email('v.email');
const password = z.string().min(8, 'v.password_min').max(200, 'v.too_long');
const personName = z.string().trim().min(1, 'v.required').max(100, 'v.too_long');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'v.too_long')
    .transform((s) => (s === '' ? null : s))
    .nullable()
    .optional();

/** Ссылка, которую салон вставляет сам: «booksy.com/…» дополняется до https://, другие схемы не принимаем. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (s === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const optionalUrl = z
  .string()
  .trim()
  .max(500, 'v.too_long')
  .refine((s) => s === '' || normalizeUrl(s) !== null, 'v.url')
  .transform((s) => normalizeUrl(s))
  .nullable()
  .optional();

// ───────── Auth ─────────

export const registerSchema = z.object({
  salonName: z.string().trim().min(2, 'v.required').max(80, 'v.too_long'),
  name: personName,
  email,
  password,
  locale: localeSchema.default('sk'),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'v.required').max(200),
  // язык, выбранный в интерфейсе: становится языком аккаунта (письма, Wallet)
  locale: localeSchema.optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email, locale: localeSchema.optional() });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const updateMeSchema = z.object({
  name: personName.optional(),
  locale: localeSchema.optional(),
});

export const switchSalonSchema = z.object({ salonId: z.string().uuid() });

// ───────── Salon ─────────

export const updateSalonSchema = z.object({
  name: z.string().trim().min(2, 'v.required').max(80, 'v.too_long').optional(),
  address: optionalText(200),
  phone: optionalText(40),
  bookingUrl: optionalUrl,
  reviewUrl: optionalUrl,
  defaultLocale: localeSchema.optional(),
});
export type UpdateSalonInput = z.input<typeof updateSalonSchema>;

// ───────── Staff ─────────

export const createInviteSchema = z.object({
  email,
  role: roleSchema.default('STAFF'),
});
export type CreateInviteInput = z.input<typeof createInviteSchema>;

export const updateMemberSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
});

export const acceptInviteSchema = z.object({
  name: personName.optional(),
  password: password.optional(),
});
export type AcceptInviteInput = z.input<typeof acceptInviteSchema>;

// ───────── Response DTOs ─────────

export interface MeResponse {
  user: { id: string; name: string; email: string; locale: Locale };
  salons: { id: string; name: string; role: Role }[];
  currentSalonId: string | null;
  /** владелец платформы — видит /admin */
  isAdmin: boolean;
}

// ───────── Тариф ─────────

export const TRIAL_DAYS = 30;
export const PRICE_MONTH_EUR = 14.9;
export const PRICE_YEAR_EUR = 149;

export interface PlanDto {
  /** trial — пробный период; active — оплачено; expired — пробный период закончился, оплаты нет */
  status: 'trial' | 'active' | 'expired';
  trialEndsAt: string;
  paidUntil: string | null;
  /** сколько дней осталось до конца пробного периода или оплаченного срока */
  daysLeft: number;
}

export interface SalonDto {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  bookingUrl: string | null;
  reviewUrl: string | null;
  defaultLocale: Locale;
  timezone: string;
  plan: PlanDto;
}

export interface StaffResponse {
  members: {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
    active: boolean;
    isMe: boolean;
  }[];
  invites: { id: string; email: string; role: Role; expiresAt: string }[];
}

export interface InviteInfoResponse {
  salonName: string;
  email: string;
  role: Role;
  userExists: boolean;
}

export interface ApiErrorBody {
  error: { code: string; issues?: { path: string; message: string }[] };
}

// ───────── Программа лояльности ─────────

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'v.color');

export const programSchema = z.object({
  name: z.string().trim().min(1, 'v.required').max(40, 'v.too_long'),
  stampsRequired: z.coerce.number().int('v.int').min(2, 'v.stamps_range').max(30, 'v.stamps_range'),
  rewardText: z.string().trim().min(1, 'v.required').max(60, 'v.too_long'),
  cooldownHours: z.coerce.number().int('v.int').min(0, 'v.cooldown_range').max(168, 'v.cooldown_range'),
  // не задано — остаётся как было (по умолчанию в БД включено)
  firstStampOnJoin: z.boolean().optional(),
  winbackEnabled: z.boolean().optional(),
  rewardReminderEnabled: z.boolean().optional(),
  birthdayEnabled: z.boolean().optional(),
  reviewRequestEnabled: z.boolean().optional(),
  referralEnabled: z.boolean().optional(),
  referralBonus: z.coerce.number().int('v.int').min(1, 'v.referral_bonus').max(3, 'v.referral_bonus').optional(),
  // '' — подарка нет, только поздравление
  birthdayGift: z.string().trim().max(60, 'v.too_long').nullable().optional(),
  bgColor: hexColor,
  fgColor: hexColor,
  labelColor: hexColor,
  stampShape: z.enum(STAMP_SHAPES).optional(),
  stampIcon: z.enum(STAMP_ICONS).optional(),
});
export type ProgramInput = z.input<typeof programSchema>;

export interface ProgramDto {
  id: string;
  name: string;
  stampsRequired: number;
  rewardText: string;
  cooldownHours: number;
  firstStampOnJoin: boolean;
  winbackEnabled: boolean;
  rewardReminderEnabled: boolean;
  birthdayEnabled: boolean;
  reviewRequestEnabled: boolean;
  referralEnabled: boolean;
  referralBonus: number;
  birthdayGift: string | null;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  stampShape: StampShape;
  stampIcon: StampIcon;
  logoUrl: string | null;
}

// ───────── Публичная регистрация клиентки ─────────

/** Версия текста согласия; меняйте при изменении текста — сохраняется у каждого клиента. */
export const CONSENT_VERSION = '2026-10-v1';

// '' из <select> — «не указано»
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().min(min, 'v.birthday').max(max, 'v.birthday').optional(),
  );

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const joinSchema = z
  .object({
    name: z.string().trim().min(1, 'v.required').max(80, 'v.too_long'),
    phone: z.string().trim().max(30, 'v.too_long').optional().default(''),
    email: z.union([z.literal(''), z.string().trim().toLowerCase().max(254).email('v.email')]).optional().default(''),
    consent: z.literal(true, { errorMap: () => ({ message: 'v.consent' }) }),
    // необязательно: согласие на рекламные сообщения и день рождения без года
    marketing: z.boolean().optional().default(false),
    birthDay: optionalInt(1, 31),
    birthMonth: optionalInt(1, 12),
    locale: localeSchema.default('sk'),
    // код из ссылки подруги (/j/{slug}?ref=…); неверный код просто игнорируется
    ref: z.string().trim().max(32).optional(),
  })
  .refine((v) => v.phone !== '' || v.email !== '', { message: 'v.contact_required', path: ['phone'] })
  .refine((v) => (v.birthDay === undefined) === (v.birthMonth === undefined), {
    message: 'v.birthday',
    path: ['birthDay'],
  })
  .refine((v) => !v.birthDay || !v.birthMonth || v.birthDay <= DAYS_IN_MONTH[v.birthMonth - 1]!, {
    message: 'v.birthday',
    path: ['birthDay'],
  });
export type JoinInput = z.input<typeof joinSchema>;

export interface PublicSalonDto {
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  program: Omit<
    ProgramDto,
    'id' | 'cooldownHours' | 'firstStampOnJoin' | 'winbackEnabled' | 'rewardReminderEnabled' | 'birthdayEnabled' | 'reviewRequestEnabled' | 'referralEnabled' | 'referralBonus' | 'birthdayGift'
  > | null;
  /** пришла по ссылке подруги: её имя (только первое) и бонус */
  referral: { name: string; bonus: number } | null;
}

export interface PublicCardDto {
  serial: string;
  qrValue: string;
  salonName: string;
  salonSlug: string;
  customerName: string;
  programName: string;
  stampCount: number;
  stampsRequired: number;
  rewardsAvailable: number;
  rewardText: string;
  bgColor: string;
  fgColor: string;
  labelColor: string;
  stampShape: StampShape;
  stampIcon: StampIcon;
  logoUrl: string | null;
  nextAppointmentAt: string | null;
  timezone: string;
  wallet: { apple: boolean; google: boolean };
  /** кнопки «Записаться» и «Оставить отзыв» — если салон указал ссылки */
  bookingUrl: string | null;
  reviewUrl: string | null;
  salonPhone: string | null;
  /** «Приведи подругу»: личная ссылка клиентки, если программа это включила */
  referral: { url: string; bonus: number } | null;
  /** карта демо-салона: какие примеры push посетитель уже отправил себе за сутки */
  demo: { used: DemoKind[] } | null;
  /** клиентка согласилась на рекламные сообщения — показываем ссылку «отписаться» */
  marketing: boolean;
}

/** Данные для продающей страницы. */
export interface SiteInfoDto {
  /** демо-салон: посетитель может добавить себе настоящую карту и посмотреть, как она работает */
  demo: { joinPath: string } | null;
  contactEmail: string | null;
}

export const marketingToggleSchema = z.object({ enabled: z.boolean() });

/** Живое демо: какое сообщение прислать себе на телефон. */
export const DEMO_KINDS = ['stamp', 'reminder', 'winback'] as const;
export type DemoKind = (typeof DEMO_KINDS)[number];
export const demoPushSchema = z.object({ kind: z.enum(DEMO_KINDS) });

// ───────── Мастер: карта клиента ─────────

export interface StaffCardDto {
  id: string;
  customer: { id: string; name: string; phone: string | null; email: string | null };
  stampCount: number;
  stampsRequired: number;
  rewardsAvailable: number;
  rewardText: string;
  totalVisits: number;
  lastStampAt: string | null;
  /** null — штамп можно ставить сейчас */
  nextStampAllowedAt: string | null;
  /** последний штамп, который ещё можно отменить */
  revocable: { eventId: string; until: string } | null;
  nextAppointmentAt: string | null;
  timezone: string;
}

/** Регистрация клиентки на кассе: та же форма, что и по QR-постеру. */
export interface CounterRegisterResponse {
  cardId: string;
  /** false — клиентка с этим телефоном/email уже была, открыта её карта */
  created: boolean;
  firstStamp: boolean;
}

export interface StampResultDto {
  card: StaffCardDto;
  rewardEarned: boolean;
}

export const appointmentSchema = z.object({
  // локальное время салона из <input type="datetime-local">: 2026-10-20T14:30
  startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'v.datetime'),
});

// ───────── Клиенты, статистика, журнал ─────────

export interface CustomerListItem {
  id: string;
  cardId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  totalVisits: number;
  stampCount: number;
  rewardsAvailable: number;
  lastVisitAt: string | null;
  createdAt: string;
}

export const CUSTOMER_FILTERS = ['reward', 'away', 'new'] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  /** сколько клиентов в каждом быстром фильтре (без учёта поиска) */
  counts: { all: number; reward: number; away: number; new: number };
  /** штампов до награды в программе салона — для «7/10» в списке */
  stampsRequired: number | null;
}

export interface HistoryItem {
  id: string;
  type: 'STAMP' | 'STAMP_BONUS' | 'STAMP_REVOKED' | 'REWARD_EARNED' | 'REWARD_REDEEMED';
  at: string;
  actorName: string | null;
}

export interface CustomerDetailDto extends CustomerListItem {
  locale: Locale;
  consentAt: string;
  consentVersion: string;
  marketingConsentAt: string | null;
  birthday: { day: number; month: number } | null;
  history: HistoryItem[];
}

export const STATS_PERIODS = ['7d', '30d', '90d'] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

export interface StatsDto {
  period: StatsPeriod;
  from: string;
  to: string;
  newCustomers: number;
  visits: number;
  /** разные клиенты, которые пришли в периоде повторно (у них был визит раньше) */
  returningCustomers: number;
  activeCustomers: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  totalCustomers: number;
  daily: { date: string; visits: number }[];
}

export interface AuditItem {
  id: string;
  action: string;
  actorName: string | null;
  entityType: string;
  entityId: string;
  payload: unknown;
  createdAt: string;
}

// ───────── Рассылки ─────────

export const BROADCAST_MAX = 150;
export const broadcastSchema = z.object({
  text: z.string().trim().min(1, 'v.required').max(BROADCAST_MAX, 'v.too_long'),
});

export interface BroadcastItem {
  id: string;
  text: string;
  recipients: number;
  createdAt: string;
}

export interface BroadcastsDto {
  /** скольким клиенткам дойдёт сообщение (активная карта + согласие на рекламу) */
  reachable: number;
  /** null — можно отправлять сейчас */
  nextAllowedAt: string | null;
  items: BroadcastItem[];
}

// ───────── Админка платформы ─────────

export interface AdminSalonItem {
  id: string;
  name: string;
  slug: string;
  ownerEmail: string | null;
  createdAt: string;
  plan: PlanDto;
  clients: number;
  stamps30d: number;
  lastStampAt: string | null;
  /** удалён: скрыт сразу, окончательно стирается через 30 дней */
  deletedAt: string | null;
}

export interface AdminOverviewDto {
  salons: AdminSalonItem[];
  totals: { salons: number; active30d: number; trial: number; paid: number; expired: number; clients: number };
}

export const ADMIN_PLAN_ACTIONS = ['paid_month', 'paid_year', 'trial_30', 'cancel_paid'] as const;
export const adminPlanSchema = z.object({ action: z.enum(ADMIN_PLAN_ACTIONS) });
/** Удаление салона: адрес салона (slug) вписывается вручную — защита от случайного нажатия. */
export const adminDeleteSalonSchema = z.object({ confirmSlug: z.string().trim() });
