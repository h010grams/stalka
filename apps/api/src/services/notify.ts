import { type Tx } from '../lib/prisma.js';
import { enqueueWalletSync } from './wallet/sync.js';

/** Сообщение на карту: текст в поле уведомлений (Apple) и сообщение Google → push на телефоне. */
export async function notifyCard(tx: Tx, cardId: string, text: string, now: Date) {
  await tx.card.update({ where: { id: cardId }, data: { walletNotice: text, walletUpdatedAt: now } });
  await enqueueWalletSync(tx, cardId, text);
}

/** То же для многих карт сразу (рассылка): два запроса вместо 2×N. */
export async function notifyCards(tx: Tx, cardIds: string[], text: string, now: Date) {
  if (cardIds.length === 0) return;
  await tx.card.updateMany({ where: { id: { in: cardIds } }, data: { walletNotice: text, walletUpdatedAt: now } });
  await tx.$executeRaw`
    INSERT INTO "WalletSyncJob" (id, "cardId", notify)
    SELECT gen_random_uuid(), id, ${text} FROM unnest(${cardIds}::uuid[]) AS id
    ON CONFLICT ("cardId") DO UPDATE
      SET notify = EXCLUDED.notify, attempts = 0, "nextAttemptAt" = now(), "lastError" = NULL`;
}

