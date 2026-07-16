-- AlterEnum
ALTER TYPE "DraftStatus" ADD VALUE 'BOUNCED';

-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN     "bounceReason" TEXT,
ADD COLUMN     "bouncedAt" TIMESTAMP(3),
ADD COLUMN     "complainedAt" TIMESTAMP(3);
