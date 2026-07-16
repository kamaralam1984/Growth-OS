-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'SCANNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TechnologyCategory" AS ENUM ('FRONTEND', 'BACKEND', 'CMS', 'ECOMMERCE', 'HOSTING', 'CDN', 'ANALYTICS', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityBand" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "RecommendationCategory" AS ENUM ('ERP', 'CRM', 'HRMS', 'HOSPITAL_MANAGEMENT', 'SCHOOL_ERP', 'INVENTORY', 'POS', 'BILLING', 'ACCOUNTING', 'WAREHOUSE', 'AI_CHATBOT', 'CUSTOMER_PORTAL', 'VENDOR_PORTAL', 'EMPLOYEE_PORTAL', 'MOBILE_APP', 'ADMIN_PANEL', 'ANALYTICS_DASHBOARD', 'WORKFLOW_AUTOMATION', 'API_INTEGRATION', 'CLOUD_MIGRATION');

-- CreateTable
CREATE TABLE "WebsiteScan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "companyId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "websiteName" TEXT,
    "companyNameInput" TEXT,
    "industryInput" TEXT,
    "websiteType" TEXT,
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "scannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technology" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "TechnologyCategory" NOT NULL,
    "evidence" TEXT NOT NULL,

    CONSTRAINT "Technology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SEOAudit" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "hasCanonical" BOOLEAN NOT NULL,
    "hasOpenGraph" BOOLEAN NOT NULL,
    "hasTwitterCard" BOOLEAN NOT NULL,
    "hasSchema" BOOLEAN NOT NULL,
    "h1Count" INTEGER NOT NULL,
    "headingStructureValid" BOOLEAN NOT NULL,
    "internalLinksCount" INTEGER NOT NULL,
    "externalLinksCount" INTEGER NOT NULL,
    "brokenLinksSampleCount" INTEGER NOT NULL,
    "brokenLinksChecked" INTEGER NOT NULL,
    "imagesTotal" INTEGER NOT NULL,
    "imagesWithoutAlt" INTEGER NOT NULL,
    "hasSitemap" BOOLEAN NOT NULL,
    "hasRobotsTxt" BOOLEAN NOT NULL,
    "isIndexable" BOOLEAN NOT NULL,
    "seoScore" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,

    CONSTRAINT "SEOAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerformanceAudit" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "htmlSizeBytes" INTEGER NOT NULL,
    "scriptTagCount" INTEGER NOT NULL,
    "stylesheetCount" INTEGER NOT NULL,
    "imageTagCount" INTEGER NOT NULL,
    "hasCaching" BOOLEAN NOT NULL,
    "hasCompression" BOOLEAN NOT NULL,
    "performanceScore" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,

    CONSTRAINT "PerformanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UXAudit" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "hasNav" BOOLEAN NOT NULL,
    "formCount" INTEGER NOT NULL,
    "ctaCount" INTEGER NOT NULL,
    "altTextCoveragePct" INTEGER NOT NULL,
    "readabilityScore" DOUBLE PRECISION NOT NULL,
    "viewportMetaPresent" BOOLEAN NOT NULL,
    "colorContrastNote" TEXT NOT NULL,
    "uxScore" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,

    CONSTRAINT "UXAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAudit" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "isHttps" BOOLEAN NOT NULL,
    "hasHsts" BOOLEAN NOT NULL,
    "hasCsp" BOOLEAN NOT NULL,
    "hasXFrameOptions" BOOLEAN NOT NULL,
    "hasXContentTypeOptions" BOOLEAN NOT NULL,
    "cookiesSecureFlag" BOOLEAN,
    "cookiesHttpOnlyFlag" BOOLEAN,
    "mixedContentCount" INTEGER NOT NULL,
    "securityScore" INTEGER NOT NULL,
    "findings" JSONB NOT NULL,

    CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "digitalScore" INTEGER NOT NULL,
    "automationScore" INTEGER NOT NULL,
    "growthScore" INTEGER NOT NULL,
    "aiReadinessScore" INTEGER NOT NULL,
    "seoScore" INTEGER NOT NULL,
    "performanceScore" INTEGER NOT NULL,
    "securityScore" INTEGER NOT NULL,
    "uxScore" INTEGER NOT NULL,
    "overallOpportunityScore" INTEGER NOT NULL,
    "band" "OpportunityBand" NOT NULL,
    "estimatedValueMin" DOUBLE PRECISION,
    "estimatedValueMax" DOUBLE PRECISION,
    "estimatedTimeline" TEXT,
    "confidenceLevel" "ConfidenceLevel" NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanRecommendation" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "category" "RecommendationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutiveReport" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "strengths" TEXT[],
    "weaknesses" TEXT[],
    "businessOpportunities" TEXT[],
    "technologyOverview" TEXT NOT NULL,
    "seoFindingsSummary" TEXT NOT NULL,
    "performanceFindingsSummary" TEXT NOT NULL,
    "securityObservations" TEXT NOT NULL,
    "uxFindings" TEXT NOT NULL,
    "businessImpact" TEXT NOT NULL,
    "nextSteps" TEXT[],
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExecutiveReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteScan_organizationId_createdAt_idx" ON "WebsiteScan"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Technology_scanId_idx" ON "Technology"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "SEOAudit_scanId_key" ON "SEOAudit"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceAudit_scanId_key" ON "PerformanceAudit"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "UXAudit_scanId_key" ON "UXAudit"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityAudit_scanId_key" ON "SecurityAudit"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_scanId_key" ON "Opportunity"("scanId");

-- CreateIndex
CREATE INDEX "ScanRecommendation_scanId_idx" ON "ScanRecommendation"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutiveReport_scanId_key" ON "ExecutiveReport"("scanId");

-- AddForeignKey
ALTER TABLE "WebsiteScan" ADD CONSTRAINT "WebsiteScan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteScan" ADD CONSTRAINT "WebsiteScan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteScan" ADD CONSTRAINT "WebsiteScan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technology" ADD CONSTRAINT "Technology_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SEOAudit" ADD CONSTRAINT "SEOAudit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceAudit" ADD CONSTRAINT "PerformanceAudit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UXAudit" ADD CONSTRAINT "UXAudit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityAudit" ADD CONSTRAINT "SecurityAudit_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanRecommendation" ADD CONSTRAINT "ScanRecommendation_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReport" ADD CONSTRAINT "ExecutiveReport_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "WebsiteScan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutiveReport" ADD CONSTRAINT "ExecutiveReport_generatedByAgentId_fkey" FOREIGN KEY ("generatedByAgentId") REFERENCES "AIAgentInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
