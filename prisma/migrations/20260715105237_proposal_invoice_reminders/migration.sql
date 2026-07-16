-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
