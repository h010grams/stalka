-- AlterEnum
ALTER TYPE "StampType" ADD VALUE 'BONUS';

-- AlterTable
ALTER TABLE "LoyaltyProgram" ADD COLUMN     "referralBonus" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "referralEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable (у существующих карт код появится сразу — default считается для каждой строки)
ALTER TABLE "Card" ADD COLUMN     "referralCode" TEXT NOT NULL DEFAULT substr(md5(gen_random_uuid()::text), 1, 10),
ADD COLUMN     "referralRewardedAt" TIMESTAMPTZ,
ADD COLUMN     "referredByCardId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Card_referralCode_key" ON "Card"("referralCode");
CREATE INDEX "Card_referredByCardId_idx" ON "Card"("referredByCardId");
