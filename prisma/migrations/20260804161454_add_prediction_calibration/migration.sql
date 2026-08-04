-- CreateTable
CREATE TABLE "PredictionCalibration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "bandsJson" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PredictionCalibration_organizationId_computedAt_idx" ON "PredictionCalibration"("organizationId", "computedAt");

-- AddForeignKey
ALTER TABLE "PredictionCalibration" ADD CONSTRAINT "PredictionCalibration_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
