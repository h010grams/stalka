-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "paidUntil" TIMESTAMPTZ,
ADD COLUMN     "trialEndsAt" TIMESTAMPTZ NOT NULL DEFAULT (now() + '30 days'::interval);

