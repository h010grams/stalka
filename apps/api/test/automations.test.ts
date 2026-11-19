import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';
import { isBirthdayToday, isSendingHour, winbackAfterMs } from '../src/domain/automations.js';
import { processAutomations } from '../src/jobs/automations.js';
import { addStamp } from '../src/services/cards.js';
import { addStaff, createTestApp, joinCustomer, json, resetDb, salonWithProgram } from './helpers.js';
import type { MemoryMailer } from '../src/lib/mailer.js';

let app: FastifyInstance;
let mailer: MemoryMailer;

beforeAll(async () => {
  ({ app, mailer } = await createTestApp());
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
});

const DAY = 24 * 3600_000;
// 19. 11. 2026, 12:00 в Братиславе (UTC+1) — рабочее время салона
const NOON = new Date('2026-11-19T11:00:00Z');
const daysBefore = (n: number) => new Date(NOON.getTime() - n * DAY);

/** Визиты клиентки в заданные дни (в прошлом относительно NOON). */
async function visits(salonId: string, cardId: string, daysAgo: number[]) {
  for (const d of daysAgo.sort((a, b) => b - a)) await addStamp(salonId, cardId, null, daysBefore(d));
}

const noticeOf = async (cardId: string) => (await prisma.card.findUniqueOrThrow({ where: { id: cardId } })).walletNotice;

describe('rules', () => {
  it('win-back waits one and a half usual gaps, within 3–17 weeks', () => {
    expect(winbackAfterMs(null)).toBe(42 * DAY);
    expect(winbackAfterMs(28 * DAY)).toBe(42 * DAY);
    expect(winbackAfterMs(7 * DAY)).toBe(21 * DAY);
    expect(winbackAfterMs(200 * DAY)).toBe(120 * DAY);
  });

  it('greets 29 February on the 28th in a non-leap year', () => {
    expect(isBirthdayToday(29, 2, { year: 2027, month: 2, day: 28 })).toBe(true);
    expect(isBirthdayToday(29, 2, { year: 2028, month: 2, day: 28 })).toBe(false);
    expect(isBirthdayToday(29, 2, { year: 2028, month: 2, day: 29 })).toBe(true);
  });

  it('sends only during the day in the salon time zone', () => {
    expect(isSendingHour(NOON, 'Europe/Bratislava')).toBe(true);
    expect(isSendingHour(new Date('2026-11-19T21:00:00Z'), 'Europe/Bratislava')).toBe(false);
    expect(isSendingHour(new Date('2026-11-19T08:30:00Z'), 'Europe/Bratislava')).toBe(false);
  });
});

describe('sign-up', () => {
  it('stores optional marketing consent and birthday', async () => {
    const { owner, slug } = await salonWithProgram(app);
    const { cardId } = await joinCustomer(app, slug, { marketing: true, birthDay: '7', birthMonth: '3' });
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: { customer: true } });
    expect(card.customer.marketingConsentAt).not.toBeNull();
    expect([card.customer.birthDay, card.customer.birthMonth]).toEqual([7, 3]);

    const detail = json(await owner.client.get(`/api/customers/${card.customerId}`));
    expect(detail.birthday).toEqual({ day: 7, month: 3 });
    expect(detail.marketingConsentAt).not.toBeNull();
  });

  it('rejects impossible or half-filled birthdays', async () => {
    const { slug } = await salonWithProgram(app);
    const join = (body: object) =>
      app.inject({
        method: 'POST',
        url: `/api/public/salons/${slug}/join`,
        payload: { name: 'X', phone: '0905999111', consent: true, ...body },
      });
    expect((await join({ birthDay: 31, birthMonth: 2 })).statusCode).toBe(400);
    expect((await join({ birthDay: 5, birthMonth: '' })).statusCode).toBe(400);
    expect((await join({ birthDay: '', birthMonth: '' })).statusCode).toBe(201);
  });

  it('client can switch marketing messages off and on from her card', async () => {
    const { slug } = await salonWithProgram(app);
    const { serial } = await joinCustomer(app, slug, { marketing: true });
    const off = await app.inject({ method: 'POST', url: `/api/public/cards/${serial}/marketing`, payload: { enabled: false } });
    expect(json(off).marketing).toBe(false);
    const on = await app.inject({ method: 'POST', url: `/api/public/cards/${serial}/marketing`, payload: { enabled: true } });
    expect(json(on).marketing).toBe(true);
  });
});

describe('reward reminder', () => {
  it('reminds once after two weeks, also without marketing consent', async () => {
    const { salonId, slug } = await salonWithProgram(app, { stampsRequired: 2, cooldownHours: 0 });
    const { cardId } = await joinCustomer(app, slug);
    await visits(salonId, cardId, [20, 15]); // награда получена 15 дней назад

    expect((await processAutomations(NOON)).rewards).toBe(1);
    expect(await noticeOf(cardId)).toMatch(/^Čaká na vás odmena: Zľava 15 %/);
    expect((await processAutomations(NOON)).rewards).toBe(0);
  });

  it('waits two weeks and stays quiet at night or when switched off', async () => {
    const { owner, salonId, slug, program } = await salonWithProgram(app, { stampsRequired: 2, cooldownHours: 0 });
    const fresh = await joinCustomer(app, slug);
    await visits(salonId, fresh.cardId, [12, 10]);
    expect((await processAutomations(NOON)).rewards).toBe(0);

    const old = await joinCustomer(app, slug);
    await visits(salonId, old.cardId, [30, 20]);
    expect((await processAutomations(new Date('2026-11-19T22:00:00Z'))).rewards).toBe(0);

    await owner.client.put('/api/program', { ...program, rewardReminderEnabled: false });
    expect((await processAutomations(NOON)).rewards).toBe(0);
  });
});

describe('win-back', () => {
  it('nudges a regular after one and a half usual gaps, once per absence', async () => {
    const { salonId, slug } = await salonWithProgram(app, { cooldownHours: 0 });
    const { cardId } = await joinCustomer(app, slug, { marketing: true });
    await visits(salonId, cardId, [100, 80, 60, 40]); // каждые 20 дней, последний 40 дней назад

    expect((await processAutomations(daysBefore(15))).winback).toBe(0); // прошло 25 дней < 30
    expect((await processAutomations(NOON)).winback).toBe(1);
    expect(await noticeOf(cardId)).toMatch(/^Dlho sme sa nevideli/);
    expect((await processAutomations(NOON)).winback).toBe(0);

    // новый визит — новая пауза, можно напомнить снова
    await addStamp(salonId, cardId, null, new Date(NOON.getTime() + 3600_000));
    expect((await processAutomations(new Date(NOON.getTime() + 40 * DAY))).winback).toBe(1);
  });

  it('needs marketing consent and skips clients who already booked', async () => {
    const { owner, salonId, slug } = await salonWithProgram(app, { cooldownHours: 0 });
    const silent = await joinCustomer(app, slug);
    await visits(salonId, silent.cardId, [60]);
    const booked = await joinCustomer(app, slug, { marketing: true });
    await visits(salonId, booked.cardId, [60]);
    await prisma.appointment.create({
      data: {
        salonId,
        cardId: booked.cardId,
        startsAt: new Date(Date.now() + 5 * DAY),
        createdByUserId: owner.me.user.id,
      },
    });
    expect((await processAutomations(NOON)).winback).toBe(0);
  });

  it('does not wake up clients who have been gone for half a year', async () => {
    const { salonId, slug } = await salonWithProgram(app);
    const { cardId } = await joinCustomer(app, slug, { marketing: true });
    await visits(salonId, cardId, [200]);
    expect((await processAutomations(NOON)).winback).toBe(0);
  });
});

describe('birthday', () => {
  it('greets with the gift once a year, only with consent', async () => {
    const { owner, slug, program } = await salonWithProgram(app);
    await owner.client.put('/api/program', { ...program, birthdayGift: 'káva zadarmo' });
    const fan = await joinCustomer(app, slug, { marketing: true, birthDay: 19, birthMonth: 11 });
    const quiet = await joinCustomer(app, slug, { birthDay: 19, birthMonth: 11 });

    expect((await processAutomations(NOON)).birthdays).toBe(1);
    expect(await noticeOf(fan.cardId)).toBe('Všetko najlepšie k narodeninám! 🎉 Darček od Salón Test: káva zadarmo');
    expect(await noticeOf(quiet.cardId)).toBeNull();
    expect((await processAutomations(new Date(NOON.getTime() + 3600_000))).birthdays).toBe(0);
  });
});

describe('broadcast', () => {
  it('reaches only clients with consent, at most once a day', async () => {
    const { owner, slug } = await salonWithProgram(app);
    const yes = await joinCustomer(app, slug, { marketing: true });
    const no = await joinCustomer(app, slug);
    await prisma.walletSyncJob.deleteMany();

    expect(json(await owner.client.get('/api/broadcasts')).reachable).toBe(1);
    const sent = await owner.client.post('/api/broadcasts', { text: 'Zajtra o 14:00 máme voľný termín.' });
    expect(sent.statusCode).toBe(201);
    expect(json(sent).recipients).toBe(1);
    expect(await noticeOf(yes.cardId)).toBe('Zajtra o 14:00 máme voľný termín.');
    expect(await noticeOf(no.cardId)).toBeNull();
    expect(await prisma.walletSyncJob.findUnique({ where: { cardId: yes.cardId } })).toMatchObject({
      notify: 'Zajtra o 14:00 máme voľný termín.',
    });

    const again = await owner.client.post('/api/broadcasts', { text: 'Ešte raz' });
    expect(again.statusCode).toBe(409);
    expect(json(again).error.code).toBe('broadcast_too_soon');
    expect(json(await owner.client.get('/api/broadcasts')).nextAllowedAt).not.toBeNull();
  });

  it('is for the owner only and needs someone to send to', async () => {
    const { owner, slug } = await salonWithProgram(app);
    const staff = await addStaff(app, owner.client, mailer);
    expect((await staff.client.post('/api/broadcasts', { text: 'Ahoj' })).statusCode).toBe(403);
    expect(json(await owner.client.post('/api/broadcasts', { text: 'Ahoj' })).error.code).toBe('no_recipients');
    await joinCustomer(app, slug); // без согласия — всё ещё некому
    expect((await owner.client.post('/api/broadcasts', { text: 'Ahoj' })).statusCode).toBe(400);
  });
});

describe('CSV export', () => {
  it('exports all clients for Excel, owner only', async () => {
    const { owner, slug } = await salonWithProgram(app);
    await joinCustomer(app, slug, { name: '=HYPERLINK("x")', phone: '0905111222', marketing: true, birthDay: 7, birthMonth: 3 });
    const staff = await addStaff(app, owner.client, mailer);
    expect((await staff.client.get('/api/customers/export.csv')).statusCode).toBe(403);

    const res = await owner.client.get('/api/customers/export.csv');
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.body.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Meno;Telefón;E-mail/);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")";+421905111222;`);
    expect(lines[1]).toMatch(/;7\.3\.$/);
  });

  it('anonymizing a client also forgets her birthday and consent', async () => {
    const { owner, slug } = await salonWithProgram(app);
    const { cardId } = await joinCustomer(app, slug, { marketing: true, birthDay: 7, birthMonth: 3 });
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
    await owner.client.delete(`/api/customers/${card.customerId}`);
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: card.customerId } });
    expect([c.marketingConsentAt, c.birthDay, c.birthMonth]).toEqual([null, null, null]);
  });
});
