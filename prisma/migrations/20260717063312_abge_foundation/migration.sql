-- CreateEnum
CREATE TYPE "ClientHealthClassification" AS ENUM ('HEALTHY', 'NEEDS_ATTENTION', 'HIGH_RISK');

-- CreateEnum
CREATE TYPE "ClientOpportunityKind" AS ENUM ('UPSELL', 'CROSS_SELL', 'REFERRAL');

-- CreateEnum
CREATE TYPE "ClientOpportunityStatus" AS ENUM ('SUGGESTED', 'ACTED_ON', 'DISMISSED');

-- CreateEnum
CREATE TYPE "StrategicPlanHorizon" AS ENUM ('DAYS_30', 'DAYS_90', 'DAYS_180', 'DAYS_365');

-- CreateEnum
CREATE TYPE "StrategicPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'REVENUE_CONCENTRATION';
ALTER TYPE "AlertType" ADD VALUE 'RESOURCE_SHORTAGE';

-- AlterTable
ALTER TABLE "Alert" ADD COLUMN     "mitigationSuggestions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ExecutiveBriefing" ADD COLUMN     "narrativeSummary" TEXT;

-- AlterTable
ALTER TABLE "Insight" ADD COLUMN     "impactsCustomer" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referredByClientId" TEXT;

-- CreateTable
CREATE TABLE "ClientHealthSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "classification" "ClientHealthClassification" NOT NULL,
    "paymentScore" INTEGER NOT NULL,
    "engagementScore" INTEGER NOT NULL,
    "deliveryScore" INTEGER NOT NULL,
    "contractScore" INTEGER NOT NULL,
    "dataConfidence" INTEGER NOT NULL,
    "factorsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthScoreSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "salesScore" INTEGER NOT NULL,
    "marketingScore" INTEGER NOT NULL,
    "customerSuccessScore" INTEGER NOT NULL,
    "operationsScore" INTEGER NOT NULL,
    "financeScore" INTEGER NOT NULL,
    "productivityScore" INTEGER NOT NULL,
    "aiAdoptionScore" INTEGER NOT NULL,
    "automationScore" INTEGER NOT NULL,
    "technologyScore" INTEGER NOT NULL,
    "customerSatisfactionScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "axisConfidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthScoreSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthImprovementPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "narrativeSummary" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthImprovementPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnRiskAssessment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "probabilityScore" INTEGER NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "reasons" JSONB NOT NULL,
    "aiNarrative" TEXT,
    "recommendedActions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidenceScore" INTEGER NOT NULL,
    "generatedByAgentId" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOpportunity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "kind" "ClientOpportunityKind" NOT NULL,
    "status" "ClientOpportunityStatus" NOT NULL DEFAULT 'SUGGESTED',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "estimatedValue" DOUBLE PRECISION,
    "evidence" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketTrendSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "industry" TEXT,
    "trends" JSONB NOT NULL,
    "opportunities" JSONB,
    "verificationMethod" TEXT NOT NULL DEFAULT 'ai-web-search',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketTrendSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "horizon" "StrategicPlanHorizon" NOT NULL,
    "status" "StrategicPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "narrativeSummary" TEXT NOT NULL,
    "goals" JSONB NOT NULL,
    "groundedInSnapshot" JSONB NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "generatedByAgentId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategicPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientHealthSnapshot_organizationId_date_idx" ON "ClientHealthSnapshot"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClientHealthSnapshot_clientId_date_key" ON "ClientHealthSnapshot"("clientId", "date");

-- CreateIndex
CREATE INDEX "GrowthScoreSnapshot_organizationId_date_idx" ON "GrowthScoreSnapshot"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthScoreSnapshot_organizationId_date_key" ON "GrowthScoreSnapshot"("organizationId", "date");

-- CreateIndex
CREATE INDEX "GrowthImprovementPlan_organizationId_createdAt_idx" ON "GrowthImprovementPlan"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurnRiskAssessment_clientId_key" ON "ChurnRiskAssessment"("clientId");

-- CreateIndex
CREATE INDEX "ChurnRiskAssessment_organizationId_riskLevel_idx" ON "ChurnRiskAssessment"("organizationId", "riskLevel");

-- CreateIndex
CREATE INDEX "ClientOpportunity_organizationId_kind_createdAt_idx" ON "ClientOpportunity"("organizationId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ClientOpportunity_clientId_idx" ON "ClientOpportunity"("clientId");

-- CreateIndex
CREATE INDEX "MarketTrendSnapshot_organizationId_createdAt_idx" ON "MarketTrendSnapshot"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "StrategicPlan_organizationId_horizon_createdAt_idx" ON "StrategicPlan"("organizationId", "horizon", "createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referredByClientId_fkey" FOREIGN KEY ("referredByClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHealthSnapshot" ADD CONSTRAINT "ClientHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientHealthSnapshot" ADD CONSTRAINT "ClientHealthSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthScoreSnapshot" ADD CONSTRAINT "GrowthScoreSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthImprovementPlan" ADD CONSTRAINT "GrowthImprovementPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthImprovementPlan" ADD CONSTRAINT "GrowthImprovementPlan_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "GrowthScoreSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnRiskAssessment" ADD CONSTRAINT "ChurnRiskAssessment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurnRiskAssessment" ADD CONSTRAINT "ChurnRiskAssessment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOpportunity" ADD CONSTRAINT "ClientOpportunity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientOpportunity" ADD CONSTRAINT "ClientOpportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketTrendSnapshot" ADD CONSTRAINT "MarketTrendSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicPlan" ADD CONSTRAINT "StrategicPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
