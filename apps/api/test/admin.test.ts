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
