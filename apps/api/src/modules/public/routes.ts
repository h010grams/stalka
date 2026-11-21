import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import QRCode from 'qrcode';
import { demoPushSchema, joinSchema, marketingToggleSchema, type DemoKind, type PublicCardDto, type PublicSalonDto, type SiteInfoDto } from '@stalka/shared';
import { config } from '../../config.js';
import { urls } from '../../services/urls.js';
import { assertUuid, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { parse } from '../../lib/validate.js';
import { squareLogo, stripPng } from '../../services/images.js';
import { registerCustomer } from '../../services/registration.js';
import * as apple from '../../services/wallet/apple.js';
import * as google from '../../services/wallet/google.js';
import { loadWalletCard, type WalletCard } from '../../services/walletCard.js';
import { toProgramDto } from '../program/routes.js';
import { demoUsed, isDemoCard, sendDemoPush } from '../../services/demo.js';

/** Карта для страницы клиентки; у демо-салона — ещё и какие примеры push уже отправлены. */
async function withDemo(card: WalletCard): Promise<PublicCardDto> {
  return toPublicCard(card, isDemoCard(card) ? await demoUsed(card) : null);
}

const IMMUTABLE = 'public, max-age=31536000, immutable';

export function toPublicCard(card: WalletCard, demoUsedKinds: DemoKind[] | null = null): PublicCardDto {
  const program = toProgramDto(card.program);
  return {
    serial: card.serialNumber,
    qrValue: card.qrToken,
    salonName: card.salon.name,
    salonSlug: card.salon.slug,
    customerName: card.customer.name,
    programName: program.name,
    stampCount: card.stampCount,
    stampsRequired: program.stampsRequired,
    rewardsAvailable: card.rewardsAvailable,
    rewardText: program.rewardText,
    bgColor: program.bgColor,
    fgColor: program.fgColor,
    labelColor: program.labelColor,
    logoUrl: program.logoUrl,
    nextAppointmentAt: card.appointments[0]?.startsAt.toISOString() ?? null,
    timezone: card.salon.timezone,
    wallet: { apple: apple.appleEnabled(), google: google.googleEnabled() },
    bookingUrl: card.salon.bookingUrl,
    reviewUrl: card.salon.reviewUrl,
    salonPhone: card.salon.phone,
    marketing: card.customer.marketingConsentAt !== null,
    demo: demoUsedKinds ? { used: demoUsedKinds } : null,
  };
}

async function activeCard(serial: string) {
  const card = await loadWalletCard({ serialNumber: serial });
  if (!card || card.status !== 'ACTIVE') throw notFound('card_not_found');
  return card;
}

function sendPng(reply: FastifyReply, png: Buffer) {
  return reply.header('Content-Type', 'image/png').header('Cache-Control', IMMUTABLE).send(png);
}

/** /api/public — без авторизации: клиентки, Google и Apple. */
export const publicRoutes: FastifyPluginAsync = async (app) => {
  const joinLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };
  const readLimit = { rateLimit: { max: 120, timeWindow: '1 minute' } };

  // ───────── Продающая страница ─────────

  app.get('/site', { config: readLimit }, async (): Promise<SiteInfoDto> => {
    const demo = config.DEMO_SALON_SLUG
      ? await prisma.salon.findFirst({ where: { slug: config.DEMO_SALON_SLUG, deletedAt: null }, select: { slug: true } })
      : null;
    return { demo: demo ? { joinPath: `/j/${demo.slug}` } : null, contactEmail: config.CONTACT_EMAIL ?? null };
  });

  // QR на демо-карту: на компьютере посетитель наводит телефон и получает карту в свой Wallet
  app.get('/demo-qr.svg', { config: readLimit }, async (_req, reply) => {
    if (!config.DEMO_SALON_SLUG) throw notFound();
    const svg = await QRCode.toString(urls.joinPage(config.DEMO_SALON_SLUG), { type: 'svg', margin: 1 });
    return reply.header('Content-Type', 'image/svg+xml').header('Cache-Control', 'public, max-age=3600').send(svg);
  });

  // ───────── Салон и регистрация ─────────

  app.get<{ Params: { slug: string } }>('/salons/:slug', { config: readLimit }, async (req): Promise<PublicSalonDto> => {
    const salon = await prisma.salon.findUnique({ where: { slug: req.params.slug }, include: { programs: true } });
    if (!salon || salon.deletedAt) throw notFound('salon_not_found');
    const p = salon.programs.find((x) => x.isActive);
    let program: PublicSalonDto['program'] = null;
    if (p) {
      const {
        id: _id,
        cooldownHours: _c,
        firstStampOnJoin: _f,
        winbackEnabled: _w,
        rewardReminderEnabled: _r,
        birthdayEnabled: _b,
        reviewRequestEnabled: _rv,
        birthdayGift: _g,
        ...rest
      } = toProgramDto(p);
      program = rest;
    }
    return { name: salon.name, slug: salon.slug, address: salon.address, phone: salon.phone, program };
  });

  app.post<{ Params: { slug: string } }>('/salons/:slug/join', { config: joinLimit }, async (req, reply) => {
    const input = parse(joinSchema, req.body);
    const salon = await prisma.salon.findUnique({ where: { slug: req.params.slug }, select: { id: true, deletedAt: true } });
    if (!salon || salon.deletedAt) throw notFound('salon_not_found');
    const { serial } = await registerCustomer(salon.id, input, { actorUserId: null, source: 'poster' });
    return reply.code(201).send({ serial });
  });

  // ───────── Карта клиентки ─────────

  app.get<{ Params: { serial: string } }>('/cards/:serial', { config: readLimit }, async (req) => {
    return withDemo(await activeCard(assertUuid(req.params.serial, 'card_not_found')));
  });

  // Живое демо: настоящий push на телефон посетителя (только карты демо-салона)
  app.post<{ Params: { serial: string } }>('/cards/:serial/demo', { config: joinLimit }, async (req) => {
    const { kind } = parse(demoPushSchema, req.body);
    const card = await activeCard(assertUuid(req.params.serial, 'card_not_found'));
    await sendDemoPush(card, kind);
    return withDemo(await activeCard(card.serialNumber));
  });

  // Клиентка сама включает или отключает рекламные сообщения (GDPR: отказ так же прост, как согласие)
  app.post<{ Params: { serial: string } }>('/cards/:serial/marketing', { config: joinLimit }, async (req) => {
    const { enabled } = parse(marketingToggleSchema, req.body);
    const card = await activeCard(assertUuid(req.params.serial, 'card_not_found'));
    await prisma.customer.update({
      where: { id: card.customerId },
      data: { marketingConsentAt: enabled ? new Date() : null },
    });
    return withDemo(await activeCard(card.serialNumber));
  });

  app.get<{ Params: { serial: string } }>('/cards/:serial/qr.svg', { config: readLimit }, async (req, reply) => {
    const card = await activeCard(assertUuid(req.params.serial, 'card_not_found'));
    const svg = await QRCode.toString(card.qrToken, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return reply.header('Content-Type', 'image/svg+xml').header('Cache-Control', 'private, max-age=300').send(svg);
  });

  /** Кнопка «Save to Google Wallet» ведёт сюда → редирект на pay.google.com с подписанным JWT. */
  app.get<{ Params: { serial: string } }>('/cards/:serial/google', { config: joinLimit }, async (req, reply) => {
    if (!google.googleEnabled()) throw notFound('google_disabled');
    const card = await activeCard(assertUuid(req.params.serial, 'card_not_found'));
    return reply.redirect(await google.saveUrl(card));
  });

  /** Кнопка «Add to Apple Wallet» — отдаёт подписанный .pkpass. */
  app.get<{ Params: { serial: string } }>('/cards/:serial/pass.pkpass', { config: joinLimit }, async (req, reply) => {
    if (!apple.appleEnabled()) throw notFound('apple_disabled');
    const card = await activeCard(assertUuid(req.params.serial, 'card_not_found'));
    const pkpass = await apple.generatePass(card);
    return reply
      .header('Content-Type', 'application/vnd.apple.pkpass')
      .header('Content-Disposition', 'attachment; filename="card.pkpass"')
      .header('Cache-Control', 'no-store')
      .send(pkpass);
  });

  // ───────── Картинки (их скачивают Google и браузер) ─────────

  async function programOr404(id: string) {
    const p = await prisma.loyaltyProgram.findUnique({ where: { id: assertUuid(id) } });
    if (!p) throw notFound();
    return p;
  }

  app.get<{ Params: { id: string } }>('/programs/:id/logo.png', async (req, reply) => {
    const p = await programOr404(req.params.id);
    if (!p.logoAssetId) throw notFound();
    const asset = await prisma.asset.findUnique({ where: { id: p.logoAssetId } });
    if (!asset) throw notFound();
    return sendPng(reply, Buffer.from(asset.data));
  });

  app.get<{ Params: { id: string } }>('/programs/:id/logo-square.png', async (req, reply) => {
    const p = await programOr404(req.params.id);
    const asset = p.logoAssetId ? await prisma.asset.findUnique({ where: { id: p.logoAssetId } }) : null;
    const png = await squareLogo(asset ? Buffer.from(asset.data) : null, { bg: p.bgColor, fg: p.fgColor }, 660);
    return sendPng(reply, png);
  });

  app.get<{ Params: { id: string; filled: string } }>('/programs/:id/strip/:filled.png', async (req, reply) => {
    const p = await programOr404(req.params.id);
    const filled = Number(req.params.filled);
    if (!Number.isInteger(filled) || filled < 0 || filled > p.stampsRequired) throw notFound();
    return sendPng(reply, await stripPng(p, filled, p.stampsRequired, 3));
  });
};
