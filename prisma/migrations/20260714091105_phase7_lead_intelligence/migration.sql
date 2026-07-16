-- CreateEnum
CREATE TYPE "LeadScoreBand" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "ResearchTopic" AS ENUM ('COMPETITORS', 'TECHNOLOGY', 'BUSINESS_MODEL', 'EXPANSION', 'NEWS', 'HIRING_TRENDS', 'PUBLIC_SIGNALS', 'GENERAL');

-- CreateEnum
CREATE TYPE "CompanyTimelineEventType" AS ENUM ('CREATED', 'FUNDING', 'WEBSITE_UPDATE', 'ANNOUNCEMENT', 'HIRING', 'EXPANSION', 'RESEARCH_NOTE', 'INTERNAL_ACTIVITY');

-- CreateEnum
CREATE TYPE "TimelineEventSource" AS ENUM ('SYSTEM', 'AI_RESEARCH', 'MANUAL');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('BEST_OPPORTUNITY', 'HIGHEST_VALUE_LEAD', 'MOST_ACTIVE_COMPANY', 'FASTEST_GROWING_COMPANY', 'RECOMMENDED_INDUSTRY', 'SUGGESTED_NEXT_STEP');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "contactFormUrl" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "estimatedRevenue" DOUBLE PRECISION,
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "fundingAmount" DOUBLE PRECISION,
ADD COLUMN     "fundingStage" TEXT,
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "growthRate" DOUBLE PRECISION,
ADD COLUMN     "headquartersCity" TEXT,
ADD COLUMN     "headquartersCountry" TEXT,
ADD COLUMN     "headquartersState" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "locations" JSONB,
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "ownerUserId" TEXT,
ADD COLUMN     "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "products" TEXT[],
ADD COLUMN     "publicPrivate" TEXT,
ADD COLUMN     "remoteHybrid" TEXT,
ADD COLUMN     "servicesOffered" TEXT[],
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "targetCustomers" TEXT,
ADD COLUMN     "technologies" TEXT[];

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "industryMatchScore" INTEGER NOT NULL,
    "companySizeScore" INTEGER NOT NULL,
    "growthScore" INTEGER NOT NULL,
    "technologyFitScore" INTEGER NOT NULL,
    "opportunitySizeScore" INTEGER NOT NULL,
    "budgetPotentialScore" INTEGER NOT NULL,
    "locationScore" INTEGER NOT NULL,
    "digitalMaturityScore" INTEGER NOT NULL,
    "automationNeedScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "band" "LeadScoreBand" NOT NULL,
    "scoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyIntelligence" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessSummary" TEXT NOT NULL,
    "productsSummary" TEXT,
    "servicesSummary" TEXT,
    "techStackSummary" TEXT,
    "digitalPresenceSummary" TEXT,
    "seoOverview" TEXT,
    "performanceOverview" TEXT,
    "growthSignals" TEXT[],
    "hiringSignals" TEXT[],
    "expansionIndicators" TEXT[],
    "businessOpportunities" TEXT[],
    "estimatedSoftwareNeeds" TEXT[],
    "potentialPainPoints" TEXT[],
    "recommendedSolution" TEXT,
    "estimatedProjectValue" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "topic" "ResearchTopic" NOT NULL,
    "content" TEXT NOT NULL,
    "generatedByAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyTimelineEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "CompanyTimelineEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "TimelineEventSource" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistCompany" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "notifyOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "lastResultCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "RecommendationType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "relatedCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_companyId_key" ON "LeadScore"("companyId");

-- CreateIndex
CREATE INDEX "LeadScore_companyId_idx" ON "LeadScore"("companyId");

-- CreateIndex
CREATE INDEX "CompanyIntelligence_companyId_createdAt_idx" ON "CompanyIntelligence"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchNote_companyId_createdAt_idx" ON "ResearchNote"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "CompanyTimelineEvent_companyId_occurredAt_idx" ON "CompanyTimelineEvent"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "Watchlist_organizationId_idx" ON "Watchlist"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistCompany_watchlistId_companyId_key" ON "WatchlistCompany"("watchlistId", "companyId");

-- CreateIndex
CREATE INDEX "SavedSearch_organizationId_userId_idx" ON "SavedSearch"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "Recommendation_organizationId_createdAt_idx" ON "Recommendation"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_companyId_idx" ON "Task"("companyId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyIntelligence" ADD CONSTRAINT "CompanyIntelligence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyIntelligence" ADD CONSTRAINT "CompanyIntelligence_generatedByAgentId_fkey" FOREIGN KEY ("generatedByAgentId") REFERENCES "AIAgentInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchNote" ADD CONSTRAINT "ResearchNote_generatedByAgentId_fkey" FOREIGN KEY ("generatedByAgentId") REFERENCES "AIAgentInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyTimelineEvent" ADD CONSTRAINT "CompanyTimelineEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistCompany" ADD CONSTRAINT "WatchlistCompany_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistCompany" ADD CONSTRAINT "WatchlistCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistCompany" ADD CONSTRAINT "WatchlistCompany_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedCompanyId_fkey" FOREIGN KEY ("relatedCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
