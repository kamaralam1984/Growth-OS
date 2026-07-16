-- AlterTable
ALTER TABLE "EmailDraft" ADD COLUMN     "resendMessageId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EmailDraft_resendMessageId_key" ON "EmailDraft"("resendMessageId");
