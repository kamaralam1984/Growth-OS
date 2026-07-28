-- AlterTable
ALTER TABLE "ExecutiveReport" ADD COLUMN     "businessPurposeSummary" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PerformanceAudit" ADD COLUMN     "cumulativeLayoutShift" DOUBLE PRECISION,
ADD COLUMN     "largestContentfulPaintMs" INTEGER,
ADD COLUMN     "measuredByRealBrowser" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalBlockingTimeMs" INTEGER;

-- AlterTable
ALTER TABLE "SEOAudit" ADD COLUMN     "rankCheckKeyword" TEXT,
ADD COLUMN     "rankCheckPosition" INTEGER,
ADD COLUMN     "rankCheckProvider" TEXT,
ADD COLUMN     "rankCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SecurityAudit" ADD COLUMN     "cookiesSameSiteFlag" BOOLEAN,
ADD COLUMN     "cspHasUnsafeDirectives" BOOLEAN,
ADD COLUMN     "hstsMaxAgeSeconds" INTEGER,
ADD COLUMN     "missingSriScriptCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UXAudit" ADD COLUMN     "contrastMeasuredByRealBrowser" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DomainInfo" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "registrar" TEXT,
    "registeredAt" TIMESTAMP(3),
    "domainAgeDays" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "rdapSource" TEXT,
    "lookupSucceeded" BOOLEAN NOT NULL DEFAULT false,
    "lookupError" TEXT,

    CONSTRAINT "DomainInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainInfo_scanId_key" ON "DomainInfo"("scanId");

-- AddForeignKey
ALTER TABLE "DomainInfo" ADD CONSTRAINT "DomainInfo_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
