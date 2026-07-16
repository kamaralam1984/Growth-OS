-- AlterTable
ALTER TABLE "DeviceSession" ADD COLUMN     "fingerprintHash" TEXT;

-- CreateIndex
CREATE INDEX "DeviceSession_fingerprintHash_idx" ON "DeviceSession"("fingerprintHash");
