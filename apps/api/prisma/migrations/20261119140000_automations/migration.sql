-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "winbackSentAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER,
ADD COLUMN     "birthdayGreetedYear" INTEGER,
ADD COLUMN     "marketingConsentAt" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "LoyaltyProgram" ADD COLUMN     "birthdayEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "birthdayGift" TEXT,
ADD COLUMN     "rewardReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "winbackEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Reward" ADD COLUMN     "reminderSentAt" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" UUID NOT NULL,
    "salonId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Broadcast_salonId_createdAt_idx" ON "Broadcast"("salonId", "createdAt");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Награды, накопленные до появления напоминаний, не напоминаем задним числом
UPDATE "Reward" SET "reminderSentAt" = now() WHERE status = 'AVAILABLE';
