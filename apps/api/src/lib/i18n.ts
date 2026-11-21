import type { Locale } from '@stalka/shared';

/** Тексты, которые видит клиентка в Wallet и в уведомлениях. */
const dict = {
  sk: {
    stamps: 'Pečiatky',
    reward_label: 'Odmena ({{n}}. návšteva)',
    available: 'Pripravené',
    next_visit: 'Ďalšia návšteva',
    customer: 'Klient',
    notice: 'Oznámenia',
    salon: 'Salón',
    how_it_works: 'Ako to funguje',
    terms: 'Pri každej návšteve dostanete pečiatku. Po {{n}}. návšteve získate odmenu: {{reward}}. Kartu ukážte pri platbe.',
    description: 'Vernostná karta – {{salon}}',
    msg_stamp: 'Pribudla pečiatka: {{count}} z {{n}}. Ďakujeme za návštevu!',
    msg_reward: 'Gratulujeme! Máte odmenu: {{reward}} 🎁',
    msg_redeem: 'Odmena bola uplatnená. Ďakujeme, že ste s nami!',
    msg_reminder: 'Pripomíname termín v salóne {{salon}}: {{when}}.',
    msg_reward_waiting: 'Čaká na vás odmena: {{reward}} 🎁 Uplatnite ju pri ďalšej návšteve.',
    msg_winback: 'Dlho sme sa nevideli 🙂 {{salon}} sa na vás teší. Rezervujte si ďalší termín.',
    msg_birthday: 'Všetko najlepšie k narodeninám praje {{salon}}! 🎉',
    msg_birthday_gift: 'Všetko najlepšie k narodeninám! 🎉 Darček od {{salon}}: {{gift}}',
    book_online: 'Rezervovať termín',
    leave_review: 'Ohodnotiť salón',
    msg_review: 'Ďakujeme za návštevu v {{salon}}! Ak ste boli spokojní, budeme radi za hodnotenie: {{url}}',
    poster_title: 'Vernostná karta',
    poster_text: 'Naskenujte QR kód fotoaparátom a pridajte si kartu do mobilu.',
    poster_reward: 'Každá {{n}}. návšteva: {{reward}}',
    poster_wallet: 'Apple Wallet · Google Wallet',
    no_wallet: 'Bez aplikácie, bez papiera.',
  },
  en: {
    stamps: 'Stamps',
    reward_label: 'Reward (visit {{n}})',
    available: 'Ready',
    next_visit: 'Next visit',
    customer: 'Customer',
    notice: 'Notifications',
    salon: 'Salon',
    how_it_works: 'How it works',
    terms: 'You get a stamp on every visit. After visit {{n}} you get a reward: {{reward}}. Show the card when paying.',
    description: 'Loyalty card – {{salon}}',
    msg_stamp: 'New stamp: {{count}} of {{n}}. Thanks for visiting!',
    msg_reward: 'Congratulations! Your reward is ready: {{reward}} 🎁',
    msg_redeem: 'Reward redeemed. Thank you for being with us!',
    msg_reminder: 'Reminder of your appointment at {{salon}}: {{when}}.',
    msg_reward_waiting: 'Your reward is waiting: {{reward}} 🎁 Use it on your next visit.',
    msg_winback: "It's been a while 🙂 {{salon}} would love to see you again. Book your next visit.",
    msg_birthday: 'Happy birthday from {{salon}}! 🎉',
    msg_birthday_gift: 'Happy birthday! 🎉 A gift from {{salon}}: {{gift}}',
    book_online: 'Book an appointment',
    leave_review: 'Leave a review',
    msg_review: 'Thank you for visiting {{salon}}! If you enjoyed it, we would love a review: {{url}}',
    poster_title: 'Loyalty card',
    poster_text: 'Scan the QR code with your camera and add the card to your phone.',
    poster_reward: 'Every {{n}}th visit: {{reward}}',
    poster_wallet: 'Apple Wallet · Google Wallet',
    no_wallet: 'No app, no paper.',
  },
  uk: {
    stamps: 'Штампи',
    reward_label: 'Нагорода ({{n}}-й візит)',
    available: 'Доступно',
    next_visit: 'Наступний візит',
    customer: 'Клієнт',
    notice: 'Сповіщення',
    salon: 'Салон',
    how_it_works: 'Як це працює',
    terms: 'За кожен візит ви отримуєте штамп. Після {{n}}-го візиту — нагорода: {{reward}}. Покажіть картку під час оплати.',
    description: 'Картка лояльності – {{salon}}',
    msg_stamp: 'Новий штамп: {{count}} з {{n}}. Дякуємо за візит!',
    msg_reward: 'Вітаємо! На вас чекає нагорода: {{reward}} 🎁',
    msg_redeem: 'Нагороду використано. Дякуємо, що ви з нами!',
    msg_reminder: 'Нагадуємо про запис у салоні {{salon}}: {{when}}.',
    msg_reward_waiting: 'На вас чекає нагорода: {{reward}} 🎁 Скористайтеся нею під час наступного візиту.',
    msg_winback: 'Давно не бачились 🙂 {{salon}} чекає на вас. Запишіться на наступний візит.',
    msg_birthday: 'З днем народження! 🎉 Вітає {{salon}}',
    msg_birthday_gift: 'З днем народження! 🎉 Подарунок від {{salon}}: {{gift}}',
    book_online: 'Записатися онлайн',
    leave_review: 'Залишити відгук',
    msg_review: 'Дякуємо за візит до {{salon}}! Якщо вам сподобалось, будемо раді відгуку: {{url}}',
    poster_title: 'Картка лояльності',
    poster_text: 'Відскануйте QR-код камерою та додайте картку в телефон.',
    poster_reward: 'Кожен {{n}}-й візит: {{reward}}',
    poster_wallet: 'Apple Wallet · Google Wallet',
    no_wallet: 'Без застосунку, без паперу.',
  },
} as const;

export type MessageKey = keyof (typeof dict)['sk'];

export function t(locale: Locale, key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template: string = dict[locale]?.[key] ?? dict.sk[key];
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ''));
}

const intlLocale: Record<Locale, string> = { sk: 'sk-SK', en: 'en-GB', uk: 'uk-UA' };

/** «ut 20. 10. o 14:30» — дата и время в часовом поясе салона. */
export function formatDateTime(date: Date, locale: Locale, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(date);
}
