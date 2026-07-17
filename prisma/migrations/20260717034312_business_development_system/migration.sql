-- CreateEnum
CREATE TYPE "OutreachAutoMode" AS ENUM ('DRAFT_ONLY', 'QUEUE_FOR_APPROVAL', 'AUTO_SEND');

-- CreateEnum
CREATE TYPE "BriefingType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- AlterEnum
ALTER TYPE "CompanySource" ADD VALUE 'AUTO_DISCOVERY';

-- CreateTable
CREATE TABLE "LeadDiscoveryConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "discoveryEnabled" BOOLEAN NOT NULL DEFAULT false,
    "searchQueries" TEXT[],
    "scoringWeights" JSONB,
    "outreachAutoMode" "OutreachAutoMode" NOT NULL DEFAULT 'DRAFT_ONLY',
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDiscoveryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOpportunity" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedImpact" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION,
    "evidence" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerPersona" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "likelyTitle" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "painPoints" TEXT[],
    "preferredChannel" TEXT,
    "confidenceScore" INTEGER NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuyerPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "competitors" JSONB NOT NULL,
    "newlyDetected" TEXT[],
    "marketSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveBriefing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "BriefingType" NOT NULL,
    "newLeadsCount" INTEGER NOT NULL,
    "opportunities" JSONB NOT NULL,
    "pendingApprovalsCount" INTEGER NOT NULL,
    "revenueForecast" JSONB NOT NULL,
    "risks" TEXT[],
    "recommendedActions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadDiscoveryConfig_organizationId_key" ON "LeadDiscoveryConfig"("organizationId");

-- CreateIndex
CREATE INDEX "LeadOpportunity_companyId_createdAt_idx" ON "LeadOpportunity"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BuyerPersona_companyId_createdAt_idx" ON "BuyerPersona"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_organizationId_createdAt_idx" ON "CompetitorSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutiveBriefing_organizationId_type_createdAt_idx" ON "ExecutiveBriefing"("organizationId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadDiscoveryConfig" ADD CONSTRAINT "LeadDiscoveryConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOpportunity" ADD CONSTRAINT "LeadOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuyerPersona" ADD CONSTRAINT "BuyerPersona_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveBriefing" ADD CONSTRAINT "ExecutiveBriefing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
