-- AlterTable
ALTER TABLE "Signature" ADD COLUMN "providerEnvelopeId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Signature_provider_providerEnvelopeId_key" ON "Signature"("provider", "providerEnvelopeId");
