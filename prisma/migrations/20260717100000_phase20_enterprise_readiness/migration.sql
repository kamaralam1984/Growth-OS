-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('OPERATIONAL', 'SECURITY', 'AVAILABILITY', 'DATA', 'COMPLIANCE');

-- CreateEnum
CREATE TYPE "SecurityRiskCategory" AS ENUM ('DATA_SECURITY', 'ACCESS_CONTROL', 'THIRD_PARTY', 'AVAILABILITY', 'COMPLIANCE', 'OPERATIONAL');

-- CreateEnum
CREATE TYPE "SecurityRiskStatus" AS ENUM ('OPEN', 'MITIGATING', 'MITIGATED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "RiskBand" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AccessReviewStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LoadTestScenario" AS ENUM ('SMOKE_10', 'RAMP_100', 'RAMP_500', 'RAMP_1000', 'RAMP_10000');

-- CreateEnum
CREATE TYPE "LaunchCheckStatus" AS ENUM ('PASS', 'WARN', 'FAIL');

-- CreateEnum
CREATE TYPE "EnterpriseDocCategory" AS ENUM ('ARCHITECTURE', 'API', 'DEVELOPER', 'ADMINISTRATOR', 'DEPLOYMENT', 'DISASTER_RECOVERY', 'SECURITY', 'COMPLIANCE', 'MARKETPLACE', 'AI_AGENT', 'INTEGRATION', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('COOKIES_ANALYTICS', 'COOKIES_MARKETING', 'MARKETING_EMAILS', 'DATA_PROCESSING');

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "category" "IncidentCategory" NOT NULL DEFAULT 'OPERATIONAL';

-- CreateTable
CREATE TABLE "SecurityRisk" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SecurityRiskCategory" NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "band" "RiskBand" NOT NULL,
    "status" "SecurityRiskStatus" NOT NULL DEFAULT 'OPEN',
    "mitigationPlan" TEXT,
    "ownerUserId" TEXT,
    "createdByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityRisk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "status" "AccessReviewStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "periodLabel" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadTestResult" (
    "id" TEXT NOT NULL,
    "scenario" "LoadTestScenario" NOT NULL,
    "targetConcurrency" INTEGER NOT NULL,
    "requestsCompleted" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "p50Ms" INTEGER NOT NULL,
    "p95Ms" INTEGER NOT NULL,
    "p99Ms" INTEGER NOT NULL,
    "errorRate" DOUBLE PRECISION NOT NULL,
    "requestsPerSecond" DOUBLE PRECISION NOT NULL,
    "bottlenecks" JSONB,
    "rawOutputPath" TEXT,
    "runByUserId" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchChecklistRun" (
    "id" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "passCount" INTEGER NOT NULL,
    "warnCount" INTEGER NOT NULL,
    "failCount" INTEGER NOT NULL,
    "runByUserId" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchChecklistRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseDocument" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "EnterpriseDocCategory" NOT NULL,
    "filePath" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "generatedByUserId" TEXT,
    "lastGeneratedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnterpriseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "escalationOrder" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityRisk_status_band_idx" ON "SecurityRisk"("status", "band");

-- CreateIndex
CREATE INDEX "AccessReview_organizationId_createdAt_idx" ON "AccessReview"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "LoadTestResult_scenario_runAt_idx" ON "LoadTestResult"("scenario", "runAt");

-- CreateIndex
CREATE INDEX "LaunchChecklistRun_runAt_idx" ON "LaunchChecklistRun"("runAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseDocument_slug_key" ON "EnterpriseDocument"("slug");

-- CreateIndex
CREATE INDEX "EnterpriseDocument_category_idx" ON "EnterpriseDocument"("category");

-- CreateIndex
CREATE INDEX "ConsentRecord_organizationId_userId_consentType_idx" ON "ConsentRecord"("organizationId", "userId", "consentType");

-- CreateIndex
CREATE INDEX "EmergencyContact_escalationOrder_idx" ON "EmergencyContact"("escalationOrder");

-- AddForeignKey
ALTER TABLE "AccessReview" ADD CONSTRAINT "AccessReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

