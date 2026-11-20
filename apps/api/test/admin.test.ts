import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/lib/prisma.js';
import { createTestApp, joinCustomer, json, resetDb, salonWithProgram, TestClient } from './helpers.js';

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

/** Владелец платформы — почта из ADMIN_EMAILS (vitest.config.ts). */
async function adminClient() {
  const client = new TestClient(app);
  const res = await client.post('/api/auth/register', {
    salonName: 'Admin salon',
    name: 'Admin',
    email: 'admin@stalka.test',
    password: 'password123',
    locale: 'sk',
  });
  expect(json(res).isAdmin).toBe(true);
  return client;
}

describe('platform admin', () => {
  it('is invisible to salon owners', async () => {
    const { owner } = await salonWithProgram(app);
    expect(json(await owner.client.get('/api/auth/me')).isAdmin).toBe(false);
    expect((await owner.client.get('/api/admin/salons')).statusCode).toBe(404);
    expect((await new TestClient(app).get('/api/admin/salons')).statusCode).toBe(401);
  });

  it('lists all salons with owner, plan and activity', async () => {
    const { slug } = await salonWithProgram(app, {}, 'Salón A');
    await joinCustomer(app, slug);
    const admin = await adminClient();

    const data = json(await admin.get('/api/admin/salons'));
    const a = data.salons.find((s: { slug: string }) => s.slug === slug);
    expect(a).toMatchObject({ name: 'Salón A', clients: 1, plan: { status: 'trial', daysLeft: 30 } });
    expect(a.ownerEmail).toMatch(/@test\.sk$/);
    expect(data.totals).toMatchObject({ salons: 2, trial: 2, paid: 0, clients: 1 });
  });

  it('marks payment, extends from the paid date, and can cancel', async () => {
    const { salonId } = await salonWithProgram(app);
    const admin = await adminClient();
    const plan = (action: string) => admin.post(`/api/admin/salons/${salonId}/plan`, { action });

    const month = json(await plan('paid_month')).plan;
    expect(month.status).toBe('active');
    expect(month.daysLeft).toBeGreaterThanOrEqual(28);

    const year = json(await plan('paid_year')).plan; // к уже оплаченному месяцу
    expect(year.daysLeft).toBeGreaterThanOrEqual(28 + 365);

    expect(json(await plan('cancel_paid')).plan.status).toBe('trial');
    const trial = json(await plan('trial_30')).plan;
    expect(trial.daysLeft).toBe(60);
    expect(await prisma.auditLog.count({ where: { salonId, action: 'admin.plan' } })).toBe(4);
  });
});

describe('salon deletion', () => {
  it('hides the salon, locks out the team, forgets clients and voids their cards', async () => {
    const { owner, salonId, slug } = await salonWithProgram(app);
    const { cardId, serial } = await joinCustomer(app, slug, { marketing: true, birthDay: 1, birthMonth: 2 });
    const admin = await adminClient();
    await prisma.walletSyncJob.deleteMany();

    const wrong = await admin.delete(`/api/admin/salons/${salonId}`, { confirmSlug: 'nieco-ine' });
    expect(json(wrong).error.code).toBe('confirm_mismatch');
    expect((await admin.delete(`/api/admin/salons/${salonId}`, { confirmSlug: slug })).statusCode).toBe(204);

    // салон больше не существует для клиенток и сотрудников
    expect((await app.inject({ method: 'GET', url: `/api/public/salons/${slug}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/public/cards/${serial}` })).statusCode).toBe(404);
    expect((await owner.client.get('/api/program')).statusCode).toBe(403);
    expect(json(await owner.client.get('/api/auth/me')).salons).toEqual([]);

    // данные клиентки стёрты, карта аннулирована и уходит в Wallet
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: { customer: true } });
    expect(card.status).toBe('VOIDED');
    expect([card.customer.name, card.customer.phoneE164, card.customer.birthDay]).toEqual(['—', null, null]);
    expect(await prisma.walletSyncJob.count({ where: { cardId } })).toBe(1);

    // в админке помечен, но не считается в итогах
    const data = json(await admin.get('/api/admin/salons'));
    expect(data.salons.find((s: { id: string }) => s.id === salonId).deletedAt).not.toBeNull();
    expect(data.totals.salons).toBe(1);
  });

  it('erases the salon for good after 30 days', async () => {
    const { purgeDeletedSalons } = await import('../src/services/salonDeletion.js');
    const { salonId, slug } = await salonWithProgram(app);
    await joinCustomer(app, slug);
    const admin = await adminClient();
    await admin.delete(`/api/admin/salons/${salonId}`, { confirmSlug: slug });

    expect(await purgeDeletedSalons()).toBe(0);
    expect(await purgeDeletedSalons(new Date(Date.now() + 31 * 24 * 3600_000))).toBe(1);
    expect(await prisma.salon.count({ where: { id: salonId } })).toBe(0);
    expect(await prisma.customer.count({ where: { salonId } })).toBe(0);
  });
});
