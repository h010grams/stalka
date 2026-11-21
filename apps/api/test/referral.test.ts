import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { applyBonus } from '../src/domain/stamping.js';
import { prisma } from '../src/lib/prisma.js';
import { createTestApp, joinCustomer, json, resetDb, salonWithProgram } from './helpers.js';

let app: FastifyInstance;

beforeAll(async () => {
  ({ app } = await createTestApp());
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
});

const card = (id: string) => prisma.card.findUniqueOrThrow({ where: { id } });
const publicCard = async (serial: string) => json(await app.inject({ method: 'GET', url: `/api/public/cards/${serial}` }));

async function referralSalon(bonus = 1) {
  const s = await salonWithProgram(app, { cooldownHours: 0 });
  const put = await s.owner.client.put('/api/program', { ...s.program, referralEnabled: true, referralBonus: bonus });
  expect(put.statusCode).toBe(200);
  return s;
}

describe('bonus stamps', () => {
  it('are not visits and can complete a card', () => {
    expect(applyBonus({ stampCount: 3, rewardsAvailable: 0, totalVisits: 3 }, 2, 5)).toEqual({
      counters: { stampCount: 0, rewardsAvailable: 1, totalVisits: 3 },
      rewardAt: [1],
    });
  });
});

describe('invite a friend', () => {
  it('both get the bonus after the friend’s first visit stamped by staff, once', async () => {
    const { owner, slug } = await referralSalon(2);
    const anna = await joinCustomer(app, slug, { name: 'Anna Krásna' });
    const { referral } = await publicCard(anna.serial);
    const code = (await card(anna.cardId)).referralCode;
    expect(referral).toEqual({ url: `http://localhost:5174/j/${slug}?ref=${code}`, bonus: 2 });

    // страница регистрации по ссылке показывает только первое имя
    const page = json(await app.inject({ method: 'GET', url: `/api/public/salons/${slug}?ref=${code}` }));
    expect(page.referral).toEqual({ name: 'Anna', bonus: 2 });
    expect(json(await app.inject({ method: 'GET', url: `/api/public/salons/${slug}?ref=nope` })).referral).toBeNull();

    const eva = await joinCustomer(app, slug, { name: 'Eva Malá', ref: code });
    expect((await card(eva.cardId)).referredByCardId).toBe(anna.cardId);

    await owner.client.post(`/api/cards/${eva.cardId}/stamps`);
    const e = await card(eva.cardId);
    expect(e).toMatchObject({ stampCount: 3, totalVisits: 1 });
    expect(e.referralRewardedAt).not.toBeNull();
    expect(e.walletNotice).toBe('Vitajte! Pečiatka + bonus 2 za odporúčanie 🎁 Máte 3 z 5.');

    const a = await card(anna.cardId);
    expect(a).toMatchObject({ stampCount: 2, totalVisits: 0 });
    expect(a.walletNotice).toBe(
      'Vaše odporúčanie zabralo: Eva má za sebou prvú návštevu. Ďakujeme! Bonus +2 🎁 Máte 2 z 5.',
    );

    // второй визит — без бонусов
    await owner.client.post(`/api/cards/${eva.cardId}/stamps`);
    expect((await card(eva.cardId)).stampCount).toBe(4);
    expect((await card(anna.cardId)).stampCount).toBe(2);

    // история: бонусные штампы отдельным типом
    const customer = (await prisma.card.findUniqueOrThrow({ where: { id: anna.cardId } })).customerId;
    const history = json(await owner.client.get(`/api/customers/${customer}`)).history;
    expect(history.filter((h: any) => h.type === 'STAMP_BONUS')).toHaveLength(2);
  });

  it('no bonus for the system join stamp, for existing customers, own code, or when switched off', async () => {
    const { owner, slug, program } = await referralSalon();
    const anna = await joinCustomer(app, slug, { phone: '0905999001' });
    const code = (await card(anna.cardId)).referralCode;

    // своя же ссылка: та же клиентка получает ту же карту, без связи
    const again = await joinCustomer(app, slug, { phone: '0905999001', ref: code });
    expect(again.cardId).toBe(anna.cardId);
    expect((await card(anna.cardId)).referredByCardId).toBeNull();

    // первый штамп при регистрации ставит система — это ещё не визит
    await owner.client.put('/api/program', { ...program, referralEnabled: true, firstStampOnJoin: true });
    const eva = await joinCustomer(app, slug, { ref: code });
    expect((await card(eva.cardId)).referralRewardedAt).toBeNull();
    expect((await card(anna.cardId)).stampCount).toBe(0);

    // программу выключили до визита подруги — бонуса нет
    await owner.client.put('/api/program', { ...program, referralEnabled: false });
    await owner.client.post(`/api/cards/${eva.cardId}/stamps`);
    expect((await card(anna.cardId)).stampCount).toBe(0);
    expect((await publicCard(anna.serial)).referral).toBeNull();
  });

  it('validates the bonus size', async () => {
    const { owner, program } = await salonWithProgram(app);
    const res = await owner.client.put('/api/program', { ...program, referralEnabled: true, referralBonus: 5 });
    expect(res.statusCode).toBe(400);
  });
});
