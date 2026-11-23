import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { CUSTOMER_FILTERS, type CustomerDetailDto, type CustomerFilter, type CustomerListItem, type CustomerListResponse, type HistoryItem } from '@stalka/shared';
import { audit } from '../../lib/audit.js';
import { assertUuid, notFound } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { requireTenant } from '../../plugins/auth.js';
import { WINBACK_DEFAULT_DAYS } from '../../domain/automations.js';
import { enqueueWalletSync, kickWalletWorker } from '../../services/wallet/sync.js';

type Row = {
  id: string;
  name: string;
  phoneE164: string | null;
  email: string | null;
  createdAt: Date;
  cardId: string | null;
  totalVisits: number;
  stampCount: number;
  rewardsAvailable: number;
  lastStampAt: Date | null;
};

function toItem(r: Row): CustomerListItem {
  return {
    id: r.id,
    cardId: r.cardId,
    name: r.name,
    phone: r.phoneE164,
    email: r.email,
    totalVisits: Number(r.totalVisits),
    stampCount: Number(r.stampCount),
    rewardsAvailable: Number(r.rewardsAvailable),
    lastVisitAt: r.lastStampAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const SORTS = {
  recent: Prisma.sql`k."lastStampAt" DESC NULLS LAST, c."createdAt" DESC`,
  visits: Prisma.sql`"totalVisits" DESC, c.name ASC`,
  name: Prisma.sql`c.name ASC`,
  new: Prisma.sql`c."createdAt" DESC`,
} as const;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Быстрые фильтры списка клиентов. */
/** «Давно не была» — дольше обычного ритма по умолчанию (как у напоминания «пора вернуться»). */
const AWAY_DAYS = WINBACK_DEFAULT_DAYS;
const NEW_DAYS = 30;
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600_000);

function filterSql(f: CustomerFilter): Prisma.Sql {
  switch (f) {
    case 'reward':
      return Prisma.sql`COALESCE(k."rewardsAvailable", 0) > 0`;
    case 'away':
      return Prisma.sql`k."lastStampAt" < ${daysAgo(AWAY_DAYS)}`;
    case 'new':
      return Prisma.sql`c."createdAt" > ${daysAgo(NEW_DAYS)}`;
  }
}

async function queryCustomers(
  salonId: string,
  opts: { q?: string; sort?: string; filter?: string; limit: number; offset: number; id?: string },
) {
  const q = (opts.q ?? '').trim();
  const conditions: Prisma.Sql[] = [Prisma.sql`c."salonId" = ${salonId}::uuid`, Prisma.sql`c."anonymizedAt" IS NULL`];
  if ((CUSTOMER_FILTERS as readonly string[]).includes(opts.filter ?? '')) conditions.push(filterSql(opts.filter as CustomerFilter));
  if (opts.id) conditions.push(Prisma.sql`c.id = ${opts.id}::uuid`);
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    // «0905 123 456» → ищем «905123456» в +421905123456.
    // Но «0001» — это конец номера: без нулей останется «1», поэтому ищем цифры как есть.
    const allDigits = q.replace(/\D/g, '');
    const withoutPrefix = allDigits.replace(/^0+/, '');
    const digits = withoutPrefix.length >= 3 ? withoutPrefix : allDigits;
    conditions.push(
      digits.length >= 3
        ? Prisma.sql`(c.name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR c."phoneE164" LIKE ${`%${digits}%`})`
        : Prisma.sql`(c.name ILIKE ${pattern} OR c.email ILIKE ${pattern})`,
    );
  }
  const where = Prisma.join(conditions, ' AND ');
  const order = SORTS[(opts.sort as keyof typeof SORTS) ?? 'recent'] ?? SORTS.recent;

  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT c.id, c.name, c."phoneE164", c.email, c."createdAt",
             k.id AS "cardId",
             COALESCE(k."totalVisits", 0) AS "totalVisits",
             COALESCE(k."stampCount", 0) AS "stampCount",
             COALESCE(k."rewardsAvailable", 0) AS "rewardsAvailable",
             k."lastStampAt"
      FROM "Customer" c
      LEFT JOIN "Card" k ON k."customerId" = c.id AND k.status = 'ACTIVE'
      WHERE ${where}
      ORDER BY ${order}
      LIMIT ${opts.limit} OFFSET ${opts.offset}`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Customer" c
      LEFT JOIN "Card" k ON k."customerId" = c.id AND k.status = 'ACTIVE'
      WHERE ${where}`,
  ]);
  return { rows, total: Number(count[0]?.n ?? 0) };
}

/** Сколько клиентов в каждом быстром фильтре (без учёта поиска) — для цифр на кнопках. */
async function filterCounts(salonId: string): Promise<CustomerListResponse['counts']> {
  const [r] = await prisma.$queryRaw<{ all: bigint; reward: bigint; away: bigint; new: bigint }[]>`
    SELECT count(*) AS "all",
           count(*) FILTER (WHERE ${filterSql('reward')}) AS "reward",
           count(*) FILTER (WHERE ${filterSql('away')}) AS "away",
           count(*) FILTER (WHERE ${filterSql('new')}) AS "new"
    FROM "Customer" c
    LEFT JOIN "Card" k ON k."customerId" = c.id AND k.status = 'ACTIVE'
    WHERE c."salonId" = ${salonId}::uuid AND c."anonymizedAt" IS NULL`;
  return { all: Number(r?.all ?? 0), reward: Number(r?.reward ?? 0), away: Number(r?.away ?? 0), new: Number(r?.new ?? 0) };
}

async function history(cardIds: string[]): Promise<HistoryItem[]> {
  if (cardIds.length === 0) return [];
  const [events, rewards] = await Promise.all([
    prisma.stampEvent.findMany({ where: { cardId: { in: cardIds } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.reward.findMany({ where: { cardId: { in: cardIds } }, orderBy: { earnedAt: 'desc' }, take: 50 }),
  ]);
  const userIds = [
    ...new Set([...events.map((e) => e.actorUserId), ...rewards.map((r) => r.redeemedByUserId)].filter((x): x is string => !!x)),
  ];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? null) : null);

  const items: HistoryItem[] = [
    ...events.map((e) => ({
      id: e.id,
      type: e.type === 'ADD' ? ('STAMP' as const) : e.type === 'BONUS' ? ('STAMP_BONUS' as const) : ('STAMP_REVOKED' as const),
      at: e.createdAt.toISOString(),
      actorName: nameOf(e.actorUserId),
    })),
    ...rewards.filter((r) => r.status !== 'VOID').map((r) => ({
      id: `${r.id}-earned`,
      type: 'REWARD_EARNED' as const,
      at: r.earnedAt.toISOString(),
      actorName: null,
    })),
    ...rewards
      .filter((r) => r.redeemedAt)
      .map((r) => ({
        id: `${r.id}-redeemed`,
        type: 'REWARD_REDEEMED' as const,
        at: r.redeemedAt!.toISOString(),
        actorName: nameOf(r.redeemedByUserId),
      })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
}

const CSV_HEADERS = {
  sk: ['Meno', 'Telefón', 'E-mail', 'Návštevy', 'Pečiatky', 'Odmeny k dispozícii', 'Posledná návšteva', 'Registrácia', 'Súhlas s ponukami', 'Narodeniny'],
  en: ['Name', 'Phone', 'Email', 'Visits', 'Stamps', 'Rewards available', 'Last visit', 'Registered', 'Marketing consent', 'Birthday'],
  uk: ['Ім’я', 'Телефон', 'E-mail', 'Візити', 'Штампи', 'Доступні нагороди', 'Останній візит', 'Реєстрація', 'Згода на пропозиції', 'День народження'],
} as const;

/** /api/customers */
export const customerRoutes: FastifyPluginAsync = async (app) => {
  // Поиск нужен и мастеру: если камера не сработала, клиентку находят по имени/телефону.
  app.get<{ Querystring: { q?: string; sort?: string; filter?: string; limit?: string; offset?: string } }>(
    '/',
    { preHandler: requireTenant() },
    async (req): Promise<CustomerListResponse> => {
      const { salonId } = req.tenant!;
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const [{ rows, total }, counts, program] = await Promise.all([
        queryCustomers(salonId, { q: req.query.q, sort: req.query.sort, filter: req.query.filter, limit, offset }),
        filterCounts(salonId),
        prisma.loyaltyProgram.findUnique({ where: { salonId }, select: { stampsRequired: true } }),
      ]);
      return { items: rows.map(toItem), total, counts, stampsRequired: program?.stampsRequired ?? null };
    },
  );

  // Все клиентки одним файлом — для Excel/Google Sheets (разделитель «;» и BOM, как ждёт Excel в SK)
  app.get('/export.csv', { preHandler: requireTenant('OWNER') }, async (req, reply) => {
    const { salonId } = req.tenant!;
    const { rows } = await queryCustomers(salonId, { sort: 'name', limit: 100_000, offset: 0 });
    const extra = await prisma.customer.findMany({
      where: { salonId, anonymizedAt: null },
      select: { id: true, marketingConsentAt: true, birthDay: true, birthMonth: true },
    });
    const byId = new Map(extra.map((e) => [e.id, e]));
    const date = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const cell = (v: string | number) => {
      const s = String(v);
      // защита от формул в Excel (CSV injection); телефоны вида +421… не трогаем
      const safe = /^(?:[=@\t\r]|[+-](?!\d))/.test(s) ? `'${s}` : s;
      return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const header = CSV_HEADERS[req.auth!.user.locale];
    const lines = rows.map((r) => {
      const e = byId.get(r.id);
      return [
        r.name,
        r.phoneE164 ?? '',
        r.email ?? '',
        Number(r.totalVisits),
        Number(r.stampCount),
        Number(r.rewardsAvailable),
        date(r.lastStampAt),
        date(r.createdAt),
        e?.marketingConsentAt ? date(e.marketingConsentAt) : '',
        e?.birthDay && e.birthMonth ? `${e.birthDay}.${e.birthMonth}.` : '',
      ]
        .map(cell)
        .join(';');
    });
    await audit(prisma, {
      salonId,
      actorUserId: req.auth!.user.id,
      action: 'customer.export_all',
      entityType: 'salon',
      entityId: salonId,
      payload: { count: rows.length },
    });
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`)
      .send('\uFEFF' + [header.join(';'), ...lines].join('\r\n') + '\r\n');
  });

  app.get<{ Params: { id: string } }>('/:id', { preHandler: requireTenant() }, async (req): Promise<CustomerDetailDto> => {
    const { salonId } = req.tenant!;
    const id = assertUuid(req.params.id);
    const { rows } = await queryCustomers(salonId, { id, limit: 1, offset: 0 });
    const customer = await prisma.customer.findFirst({ where: { id, salonId, anonymizedAt: null }, include: { cards: true } });
    if (!rows[0] || !customer) throw notFound('customer_not_found');
    return {
      ...toItem(rows[0]),
      locale: customer.locale,
      consentAt: customer.consentAt.toISOString(),
      consentVersion: customer.consentVersion,
      marketingConsentAt: customer.marketingConsentAt?.toISOString() ?? null,
      birthday:
        customer.birthDay && customer.birthMonth ? { day: customer.birthDay, month: customer.birthMonth } : null,
      history: await history(customer.cards.map((c) => c.id)),
    };
  });

  // GDPR: право на доступ — все данные клиентки одним файлом
  app.get<{ Params: { id: string } }>('/:id/export', { preHandler: requireTenant('OWNER') }, async (req, reply) => {
    const { salonId } = req.tenant!;
    const id = assertUuid(req.params.id);
    const customer = await prisma.customer.findFirst({
      where: { id, salonId, anonymizedAt: null },
      include: {
        salon: { select: { name: true, address: true, phone: true } },
        cards: {
          include: {
            program: { select: { name: true, stampsRequired: true, rewardText: true } },
            stampEvents: { orderBy: { createdAt: 'asc' }, select: { type: true, createdAt: true } },
            rewards: { orderBy: { earnedAt: 'asc' }, select: { status: true, earnedAt: true, redeemedAt: true } },
            appointments: { orderBy: { startsAt: 'asc' }, select: { startsAt: true, cancelledAt: true } },
          },
        },
      },
    });
    if (!customer) throw notFound('customer_not_found');

    await audit(prisma, {
      salonId,
      actorUserId: req.auth!.user.id,
      action: 'customer.export',
      entityType: 'customer',
      entityId: id,
    });

    const data = {
      exportedAt: new Date().toISOString(),
      controller: customer.salon,
      customer: {
        name: customer.name,
        phone: customer.phoneE164,
        email: customer.email,
        language: customer.locale,
        registeredAt: customer.createdAt,
        consent: { givenAt: customer.consentAt, textVersion: customer.consentVersion },
        marketingConsentGivenAt: customer.marketingConsentAt,
        birthday: customer.birthDay && customer.birthMonth ? `${customer.birthDay}.${customer.birthMonth}.` : null,
      },
      cards: customer.cards.map((c) => ({
        program: c.program,
        stampCount: c.stampCount,
        rewardsAvailable: c.rewardsAvailable,
        totalVisits: c.totalVisits,
        createdAt: c.createdAt,
        stamps: c.stampEvents,
        rewards: c.rewards,
        appointments: c.appointments,
      })),
    };
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="customer-${id.slice(0, 8)}.json"`)
      .send(JSON.stringify(data, null, 2));
  });

  /**
   * GDPR: право на удаление. Персональные данные стираются, карта аннулируется
   * в Wallet; обезличенные визиты остаются, чтобы не ломать статистику.
   */
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireTenant('OWNER') }, async (req, reply) => {
    const { salonId } = req.tenant!;
    const id = assertUuid(req.params.id);
    await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findFirst({ where: { id, salonId, anonymizedAt: null }, include: { cards: true } });
      if (!customer) throw notFound('customer_not_found');
      const now = new Date();
      await tx.customer.update({
        where: { id },
        data: {
          name: '—',
          phoneE164: null,
          email: null,
          marketingConsentAt: null,
          birthDay: null,
          birthMonth: null,
          anonymizedAt: now,
        },
      });
      for (const card of customer.cards) {
        await tx.card.update({
          where: { id: card.id },
          data: { status: 'VOIDED', walletNotice: null, walletUpdatedAt: now },
        });
        await tx.appointment.updateMany({ where: { cardId: card.id, cancelledAt: null }, data: { cancelledAt: now } });
        await enqueueWalletSync(tx, card.id); // Apple: voided, Google: INACTIVE
      }
      await audit(tx, {
        salonId,
        actorUserId: req.auth!.user.id,
        action: 'customer.delete',
        entityType: 'customer',
        entityId: id,
      });
    });
    kickWalletWorker();
    return reply.code(204).send();
  });
};
