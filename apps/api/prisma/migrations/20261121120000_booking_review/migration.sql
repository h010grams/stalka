-- AlterTable
ALTER TABLE "Salon" ADD COLUMN     "bookingUrl" TEXT,
ADD COLUMN     "reviewUrl" TEXT;

-- AlterTable
ALTER TABLE "LoyaltyProgram" ADD COLUMN     "reviewRequestEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "reviewRequestedAt" TIMESTAMPTZ;
