import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { prisma } from '../src/lib/prisma.js';
import type { MemoryMailer } from '../src/lib/mailer.js';
import { addStaff, createTestApp, DEFAULT_PROGRAM, joinCustomer, json, registerOwner, resetDb, salonWithProgram } from './helpers.js';

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

function multipart(filename: string, content: Buffer, mime: string) {
  const boundary = '----test' + Date.now();
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('loyalty program', () => {
  it('owner creates and updates the program; staff can read but not edit', async () => {
    const owner = await registerOwner(app);
    expect(json(await owner.client.get('/api/program')).program).toBeNull();

    const created = await owner.client.put('/api/program', DEFAULT_PROGRAM);
    expect(created.statusCode).toBe(200);
    expect(json(created).program).toMatchObject({ stampsRequired: 5, rewardText: 'Zľava 15 %', logoUrl: null });

    const staff = await addStaff(app, owner.client, mailer);
    expect(json(await staff.client.get('/api/program')).program.name).toBe('Vernostná karta');
    expect((await staff.client.put('/api/program', DEFAULT_PROGRAM)).statusCode).toBe(403);
  });

  it('validates ranges and colors', async () => {
    const owner = await registerOwner(app);
    const res = await owner.client.put('/api/program', { ...DEFAULT_PROGRAM, stampsRequired: 1, bgColor: 'red', cooldownHours: 500 });
    expect(res.statusCode).toBe(400);
    const msgs = json(res).error.issues.map((i: { message: string }) => i.message);
    expect(msgs).toEqual(expect.arrayContaining(['v.stamps_range', 'v.color', 'v.cooldown_range']));
  });

  it('visible design change re-syncs all cards; cooldown-only change does not', async () => {
    const { owner, slug } = await salonWithProgram(app);
    const { cardId } = await joinCustomer(app, slug);
    await prisma.walletSyncJob.deleteMany();

    await owner.client.put('/api/program', { ...DEFAULT_PROGRAM, cooldownHours: 2 });
    expect(await prisma.walletSyncJob.count()).toBe(0);

    await owner.client.put('/api/program', { ...DEFAULT_PROGRAM, bgColor: '#7A1F3D' });
    expect(await prisma.walletSyncJob.count({ where: { cardId } })).toBe(1);
    const p = await prisma.loyaltyProgram.findFirstOrThrow();
    expect(p.designVersion).toBe(2);
  });

  it('logo upload: resized PNG, served publicly; SVG rejected', async () => {
    const { owner, program } = await salonWithProgram(app);
    const big = await sharp({ create: { width: 2000, height: 800, channels: 4, background: '#c97b63' } }).jpeg().toBuffer();
    const { body, contentType } = multipart('logo.jpg', big, 'image/jpeg');
    const res = await app.inject({
      method: 'POST',
      url: '/api/program/logo',
      payload: body,
      headers: { 'content-type': contentType, cookie: (owner.client as any).cookie },
    });
    expect(res.statusCode).toBe(200);
    const logoUrl: string = json(res).program.logoUrl;
    expect(logoUrl).toContain(`/api/public/programs/${program.id}/logo.png?v=`);

    const png = await app.inject({ method: 'GET', url: new URL(logoUrl).pathname });
    expect(png.headers['content-type']).toBe('image/png');
    const meta = await sharp(png.rawPayload).metadata();
    expect(meta.width).toBeLessThanOrEqual(480);
    expect(meta.height).toBeLessThanOrEqual(150);

    const svg = multipart('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), 'image/svg+xml');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/program/logo',
      payload: svg.body,
      headers: { 'content-type': svg.contentType, cookie: (owner.client as any).cookie },
    });
    expect(json(bad).error.code).toBe('image_format');
  });

  it('serves strip and square logo images', async () => {
    const { program } = await salonWithProgram(app);
    const strip = await app.inject({ method: 'GET', url: `/api/public/programs/${program.id}/strip/3.png` });
    expect(strip.statusCode).toBe(200);
    expect((await sharp(strip.rawPayload).metadata()).width).toBe(1125);
    expect((await app.inject({ method: 'GET', url: `/api/public/programs/${program.id}/strip/99.png` })).statusCode).toBe(404);
    const square = await app.inject({ method: 'GET', url: `/api/public/programs/${program.id}/logo-square.png` });
    expect((await sharp(square.rawPayload).metadata()).width).toBe(660);
  });
});

describe('poster', () => {
  it('generates a PDF with QR (any member)', async () => {
    const { owner } = await salonWithProgram(app, {}, 'Štúdio Ľubica');
    const staff = await addStaff(app, owner.client, mailer);
    for (const lang of ['sk', 'uk']) {
      const res = await staff.client.get(`/api/poster/poster.pdf?lang=${lang}&size=a5`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
    }
    const qr = await owner.client.get('/api/poster/qr.png');
    expect(qr.headers['content-type']).toBe('image/png');
  });

  it('requires a program', async () => {
    const owner = await registerOwner(app);
    expect(json(await owner.client.get('/api/poster/poster.pdf')).error.code).toBe('program_missing');
  });
});

describe('public join page', () => {
  it('shows salon and program without internal fields', async () => {
    const { slug } = await salonWithProgram(app);
    const res = json(await app.inject({ method: 'GET', url: `/api/public/salons/${slug}` }));
    expect(res.name).toBe('Salón Test');
    expect(res.program).toMatchObject({ stampsRequired: 5, rewardText: 'Zľava 15 %' });
    expect(res.program.id).toBeUndefined();
    expect(res.program.cooldownHours).toBeUndefined();
  });

  it('registers a customer with consent; same phone in another format returns the same card', async () => {
    const { slug, salonId } = await salonWithProgram(app);
    const first = await app.inject({
      method: 'POST',
      url: `/api/public/salons/${slug}/join`,
      payload: { name: 'Jana', phone: '0905 123 456', consent: true, locale: 'uk' },
    });
    expect(first.statusCode).toBe(201);
    const customer = await prisma.customer.findFirstOrThrow({ where: { salonId } });
    expect(customer).toMatchObject({ phoneE164: '+421905123456', locale: 'uk', consentVersion: '2026-10-v1' });
    expect(customer.consentAt).toBeInstanceOf(Date);

    const second = await app.inject({
      method: 'POST',
      url: `/api/public/salons/${slug}/join`,
      payload: { name: 'Jana N.', phone: '+421905123456', email: 'jana@test.sk', consent: true },
    });
    expect(json(second).serial).toBe(json(first).serial);
    expect(await prisma.customer.count()).toBe(1);
    // недостающий email дополнился
    expect((await prisma.customer.findFirstOrThrow()).email).toBe('jana@test.sk');
    expect(await prisma.auditLog.count({ where: { action: 'customer.join' } })).toBe(1);
  });

  it('requires consent and at least one contact; validates phone', async () => {
    const { slug } = await salonWithProgram(app);
    const join = (payload: object) => app.inject({ method: 'POST', url: `/api/public/salons/${slug}/join`, payload });

    const noConsent = json(await join({ name: 'A', phone: '0905123456', consent: false }));
    expect(noConsent.error.issues.map((i: any) => i.message)).toContain('v.consent');
    const noContact = json(await join({ name: 'A', consent: true }));
    expect(noContact.error.issues.map((i: any) => i.message)).toContain('v.contact_required');
    const badPhone = json(await join({ name: 'A', phone: '12', consent: true }));
    expect(badPhone.error.code).toBe('phone_invalid');
  });

  it('same phone in two salons → two independent customers', async () => {
    const a = await salonWithProgram(app, {}, 'Salon A');
    const b = await salonWithProgram(app, {}, 'Salon B');
    await joinCustomer(app, a.slug, { phone: '0905111222' });
    await joinCustomer(app, b.slug, { phone: '0905111222' });
    expect(await prisma.customer.count()).toBe(2);
  });

  it('public card page data and QR; wallet buttons hidden when not configured', async () => {
    const { slug } = await salonWithProgram(app);
    const { serial, qrToken } = await joinCustomer(app, slug, { name: 'Jana' });

    const card = json(await app.inject({ method: 'GET', url: `/api/public/cards/${serial}` }));
    expect(card).toMatchObject({ customerName: 'Jana', stampCount: 0, stampsRequired: 5, qrValue: qrToken });
    expect(card.wallet).toEqual({ apple: false, google: false });

    const qr = await app.inject({ method: 'GET', url: `/api/public/cards/${serial}/qr.svg` });
    expect(qr.headers['content-type']).toBe('image/svg+xml');
    expect(qr.body).toContain('<svg');

    expect((await app.inject({ method: 'GET', url: `/api/public/cards/${serial}/pass.pkpass` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/public/cards/${serial}/google` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/public/cards/nope' })).statusCode).toBe(404);
  });
});

describe('marketing consent on the card page', () => {
  const toggle = (serial: string, enabled: boolean) =>
    app.inject({ method: 'POST', url: `/api/public/cards/${serial}/marketing`, payload: { enabled } });
  const marketingLogs = (customerId: string) =>
    prisma.auditLog.findMany({ where: { entityId: customerId, action: { startsWith: 'customer.marketing' } } });

  it('opt-out and opt-in by the client are written to the audit log', async () => {
    const { slug } = await salonWithProgram(app);
    const { serial } = await joinCustomer(app, slug, { marketing: true });
    const customer = await prisma.customer.findFirstOrThrow();

    expect((await toggle(serial, false)).statusCode).toBe(200);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).marketingConsentAt).toBeNull();
    expect((await toggle(serial, true)).statusCode).toBe(200);

    const logs = await marketingLogs(customer.id);
    expect(logs.map((l) => l.action).sort()).toEqual(['customer.marketing_off', 'customer.marketing_on']);
    for (const l of logs) expect(l).toMatchObject({ salonId: customer.salonId, actorUserId: null, entityType: 'customer' });
  });

  it('repeating the same choice does not add another audit entry', async () => {
    const { slug } = await salonWithProgram(app);
    const { serial } = await joinCustomer(app, slug, { marketing: true });
    const customer = await prisma.customer.findFirstOrThrow();

    await toggle(serial, false);
    await toggle(serial, false);

    expect(await marketingLogs(customer.id)).toHaveLength(1);
  });
});

describe('live demo push', () => {
  it('builds tomorrow 14:00 in the salon time zone, summer and winter', async () => {
    const { tomorrowAt } = await import('../src/services/demo.js');
    expect(tomorrowAt(new Date('2026-11-21T22:30:00Z'), 14, 'Europe/Bratislava').toISOString()).toBe('2026-11-22T13:00:00.000Z');
    expect(tomorrowAt(new Date('2026-07-10T08:00:00Z'), 14, 'Europe/Bratislava').toISOString()).toBe('2026-07-11T12:00:00.000Z');
  });

  it('sends each example once a day, only on demo salon cards, with a delay to lock the phone', async () => {
    const { config } = await import('../src/config.js');
    const { slug } = await salonWithProgram(app, { cooldownHours: 12, firstStampOnJoin: true });
    const other = await salonWithProgram(app);
    const { serial, cardId } = await joinCustomer(app, slug);
    const stranger = await joinCustomer(app, other.slug);
    (config as any).DEMO_SALON_SLUG = slug;
    try {
      expect(json(await app.inject({ method: 'GET', url: `/api/public/cards/${serial}` })).demo).toEqual({ used: [] });
      expect(json(await app.inject({ method: 'GET', url: `/api/public/cards/${stranger.serial}` })).demo).toBeNull();

      const push = (s: string, kind: string) => app.inject({ method: 'POST', url: `/api/public/cards/${s}/demo`, payload: { kind } });
      const before = Date.now();
      // штамп сразу после штампа при регистрации — пауза между штампами в демо не действует
      const res = await push(serial, 'stamp');
      expect(res.statusCode).toBe(200);
      expect(json(res)).toMatchObject({ stampCount: 2, demo: { used: ['stamp'] } });
      const job = await prisma.walletSyncJob.findUniqueOrThrow({ where: { cardId } });
      expect(job.notify).toBe('Pribudla pečiatka: 2 z 5. Ďakujeme za návštevu!');
      expect(job.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + 7_000);

      expect((await push(serial, 'stamp')).statusCode).toBe(429);
      const rem = await push(serial, 'reminder');
      expect(json(rem).demo.used).toEqual(['stamp', 'reminder']);
      const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId } });
      expect(card.walletNotice).toMatch(/^Pripomíname termín v salóne Salón Test: .+14:00\.$/);

      expect((await push(serial, 'winback')).statusCode).toBe(200);
      expect((await push(serial, 'nonsense')).statusCode).toBe(400);
      expect((await push(stranger.serial, 'stamp')).statusCode).toBe(404);
    } finally {
      (config as any).DEMO_SALON_SLUG = undefined;
    }
  });
});

describe('stamp style', () => {
  it('saves shape and icon, bumps the design version and renders the Wallet strip', async () => {
    const { owner, program } = await salonWithProgram(app);
    const before = await prisma.loyaltyProgram.findUniqueOrThrow({ where: { id: program.id } });
    const res = await owner.client.put('/api/program', { ...program, stampShape: 'heart', stampIcon: 'coffee' });
    expect(res.statusCode).toBe(200);
    expect(json(res).program).toMatchObject({ stampShape: 'heart', stampIcon: 'coffee' });
    const after = await prisma.loyaltyProgram.findUniqueOrThrow({ where: { id: program.id } });
    expect(after.designVersion).toBe(before.designVersion + 1);

    const strip = await app.inject({ method: 'GET', url: `/api/public/programs/${program.id}/strip/3.png?v=${after.designVersion}` });
    expect(strip.statusCode).toBe(200);
    expect(strip.headers['content-type']).toBe('image/png');

    expect((await owner.client.put('/api/program', { ...program, stampShape: 'triangle' })).statusCode).toBe(400);
  });
});
