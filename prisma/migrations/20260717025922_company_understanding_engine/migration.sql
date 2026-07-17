-- CreateEnum
CREATE TYPE "DiscoveryRunStatus" AS ENUM ('PENDING', 'CRAWLING', 'ANALYZING', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "DNAStatus" AS ENUM ('AWAITING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "CompanyDiscoveryRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "DiscoveryRunStatus" NOT NULL DEFAULT 'PENDING',
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "dnaId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyDiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationDNA" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "DNAStatus" NOT NULL DEFAULT 'AWAITING_REVIEW',
    "crawledPages" JSONB NOT NULL,
    "brandAssets" JSONB NOT NULL,
    "websiteScanId" TEXT,
    "businessUnderstanding" JSONB NOT NULL,
    "linkedinInsights" JSONB,
    "icp" JSONB NOT NULL,
    "swot" JSONB NOT NULL,
    "opportunities" JSONB NOT NULL,
    "confidence" JSONB NOT NULL,
    "unknownFields" TEXT[],
    "executiveMeetingId" TEXT,
    "draftConfiguration" JSONB NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationDNA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCompetitor" (
    "id" TEXT NOT NULL,
    "organizationDnaId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "positioning" TEXT,
    "verificationMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDiscoveryRun_dnaId_key" ON "CompanyDiscoveryRun"("dnaId");

-- CreateIndex
CREATE INDEX "CompanyDiscoveryRun_organizationId_startedAt_idx" ON "CompanyDiscoveryRun"("organizationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDNA_websiteScanId_key" ON "OrganizationDNA"("websiteScanId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationDNA_executiveMeetingId_key" ON "OrganizationDNA"("executiveMeetingId");

-- CreateIndex
CREATE INDEX "OrganizationDNA_organizationId_version_idx" ON "OrganizationDNA"("organizationId", "version");

-- CreateIndex
CREATE INDEX "OrganizationCompetitor_organizationDnaId_idx" ON "OrganizationCompetitor"("organizationDnaId");

-- AddForeignKey
ALTER TABLE "CompanyDiscoveryRun" ADD CONSTRAINT "CompanyDiscoveryRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDiscoveryRun" ADD CONSTRAINT "CompanyDiscoveryRun_dnaId_fkey" FOREIGN KEY ("dnaId") REFERENCES "OrganizationDNA"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDNA" ADD CONSTRAINT "OrganizationDNA_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDNA" ADD CONSTRAINT "OrganizationDNA_websiteScanId_fkey" FOREIGN KEY ("websiteScanId") REFERENCES "WebsiteScan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationDNA" ADD CONSTRAINT "OrganizationDNA_executiveMeetingId_fkey" FOREIGN KEY ("executiveMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCompetitor" ADD CONSTRAINT "OrganizationCompetitor_organizationDnaId_fkey" FOREIGN KEY ("organizationDnaId") REFERENCES "OrganizationDNA"("id") ON DELETE CASCADE ON UPDATE CASCADE;
