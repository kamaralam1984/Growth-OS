-- CreateEnum
CREATE TYPE "CommissionSourceType" AS ENUM ('REFERRAL', 'MARKETPLACE_SALE');

-- CreateEnum
CREATE TYPE "MarketplacePricingModel" AS ENUM ('FREE', 'ONE_TIME', 'SUBSCRIPTION');

-- CreateEnum
CREATE TYPE "MarketplaceVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'YANKED');

-- CreateEnum
CREATE TYPE "MarketplaceInstallStatus" AS ENUM ('ACTIVE', 'UNINSTALLED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "MarketplaceInstallEventType" AS ENUM ('INSTALLED', 'UPGRADED', 'UNINSTALLED', 'ROLLED_BACK', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketplacePublisherStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "JobOpeningStatus" AS ENUM ('OPEN', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "CandidateStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'HR';
ALTER TYPE "AgentType" ADD VALUE 'SUPPORT';
ALTER TYPE "AgentType" ADD VALUE 'RECRUITMENT';
ALTER TYPE "AgentType" ADD VALUE 'SEO';
ALTER TYPE "AgentType" ADD VALUE 'BUSINESS_ANALYST';
ALTER TYPE "AgentType" ADD VALUE 'RESEARCH';
ALTER TYPE "AgentType" ADD VALUE 'CUSTOMER_SUCCESS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'SUPPORT_SLA_BREACH';
ALTER TYPE "AlertType" ADD VALUE 'LATE_LEAVE_APPROVAL';

-- AlterEnum
ALTER TYPE "BriefingType" ADD VALUE 'CUSTOMER_SUCCESS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarketplaceCategory" ADD VALUE 'WORKFLOW';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'CRM_TEMPLATE';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'PROPOSAL_TEMPLATE';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'AUTOMATION_TEMPLATE';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'INDUSTRY_PACK';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'DASHBOARD_PACK';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'ANALYTICS_PACK';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'INTEGRATION_CONNECTOR';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'WHITE_LABEL_PACK';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'PROMPT_PACK';
ALTER TYPE "MarketplaceCategory" ADD VALUE 'KNOWLEDGE_PACK';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'DRAFT';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'IN_REVIEW';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'REJECTED';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'DEPRECATED';
ALTER TYPE "MarketplaceListingStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "isInternalNote" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Commission" ADD COLUMN     "marketplaceInstallId" TEXT,
ADD COLUMN     "sourceType" "CommissionSourceType" NOT NULL DEFAULT 'REFERRAL';

-- AlterTable
ALTER TABLE "License" ADD COLUMN     "marketplaceListingId" TEXT;

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "billingInterval" "BillingIntervalUnit",
ADD COLUMN     "companySizeTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "currentVersionId" TEXT,
ADD COLUMN     "industryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "installCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manifest" JSONB,
ADD COLUMN     "platformFeePercent" DOUBLE PRECISION,
ADD COLUMN     "priceCents" INTEGER,
ADD COLUMN     "pricingModel" "MarketplacePricingModel" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "publisherId" TEXT,
ADD COLUMN     "ratingAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "relatedCandidateId" TEXT;

-- CreateTable
CREATE TABLE "MarketplaceVersion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "changelog" TEXT,
    "status" "MarketplaceVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceDependency" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "dependsOnListingId" TEXT NOT NULL,
    "minVersion" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInstall" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "installedByUserId" TEXT NOT NULL,
    "status" "MarketplaceInstallStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdRowsLog" JSONB NOT NULL,
    "gatewayProvider" "PaymentGatewayProvider",
    "gatewaySubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "licenseId" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt" TIMESTAMP(3),
    "uninstalledByUserId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceInstallEvent" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "eventType" "MarketplaceInstallEventType" NOT NULL,
    "fromVersion" TEXT,
    "toVersion" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceInstallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "publisherResponse" TEXT,
    "publisherRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePublisher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "contactEmail" TEXT NOT NULL,
    "website" TEXT,
    "status" "MarketplacePublisherStatus" NOT NULL DEFAULT 'PENDING',
    "bio" TEXT,
    "logoStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePublisher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "buyerUserId" TEXT NOT NULL,
    "pricingModel" "MarketplacePricingModel" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "gatewayProvider" "PaymentGatewayProvider",
    "gatewayCheckoutSessionId" TEXT,
    "platformInvoiceId" TEXT,
    "installId" TEXT,
    "commissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "promptText" TEXT NOT NULL,
    "variables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "agentType" "AgentType",
    "sourceListingId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOpening" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT NOT NULL,
    "status" "JobOpeningStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOpening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobOpeningId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "resumeStorageKey" TEXT,
    "stage" "CandidateStage" NOT NULL DEFAULT 'APPLIED',
    "source" TEXT,
    "skillsExtracted" JSONB,
    "matchScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "interviewerUserId" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "feedback" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoKeywordResearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "keywords" JSONB NOT NULL,
    "verificationMethod" TEXT NOT NULL DEFAULT 'ai-web-search',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoKeywordResearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketplaceVersion_listingId_status_idx" ON "MarketplaceVersion"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceVersion_listingId_version_key" ON "MarketplaceVersion"("listingId", "version");

-- CreateIndex
CREATE INDEX "MarketplaceDependency_versionId_idx" ON "MarketplaceDependency"("versionId");

-- CreateIndex
CREATE INDEX "MarketplaceDependency_dependsOnListingId_idx" ON "MarketplaceDependency"("dependsOnListingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInstall_licenseId_key" ON "MarketplaceInstall"("licenseId");

-- CreateIndex
CREATE INDEX "MarketplaceInstall_organizationId_status_idx" ON "MarketplaceInstall"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceInstall_listingId_idx" ON "MarketplaceInstall"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceInstall_organizationId_listingId_key" ON "MarketplaceInstall"("organizationId", "listingId");

-- CreateIndex
CREATE INDEX "MarketplaceInstallEvent_installId_createdAt_idx" ON "MarketplaceInstallEvent"("installId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_installId_key" ON "MarketplaceReview"("installId");

-- CreateIndex
CREATE INDEX "MarketplaceReview_listingId_idx" ON "MarketplaceReview"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_listingId_organizationId_key" ON "MarketplaceReview"("listingId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePublisher_userId_key" ON "MarketplacePublisher"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplacePublisher_partnerId_key" ON "MarketplacePublisher"("partnerId");

-- CreateIndex
CREATE INDEX "MarketplacePublisher_status_idx" ON "MarketplacePublisher"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_platformInvoiceId_key" ON "MarketplaceOrder"("platformInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_installId_key" ON "MarketplaceOrder"("installId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOrder_commissionId_key" ON "MarketplaceOrder"("commissionId");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_organizationId_status_idx" ON "MarketplaceOrder"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceOrder_listingId_idx" ON "MarketplaceOrder"("listingId");

-- CreateIndex
CREATE INDEX "PromptTemplate_organizationId_idx" ON "PromptTemplate"("organizationId");

-- CreateIndex
CREATE INDEX "PromptTemplate_organizationId_category_idx" ON "PromptTemplate"("organizationId", "category");

-- CreateIndex
CREATE INDEX "JobOpening_organizationId_status_idx" ON "JobOpening"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Candidate_organizationId_stage_idx" ON "Candidate"("organizationId", "stage");

-- CreateIndex
CREATE INDEX "Candidate_jobOpeningId_idx" ON "Candidate"("jobOpeningId");

-- CreateIndex
CREATE INDEX "Interview_candidateId_idx" ON "Interview"("candidateId");

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");

-- CreateIndex
CREATE INDEX "SeoKeywordResearch_organizationId_createdAt_idx" ON "SeoKeywordResearch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Commission_marketplaceInstallId_idx" ON "Commission"("marketplaceInstallId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_slug_key" ON "MarketplaceListing"("slug");

-- CreateIndex
CREATE INDEX "MarketplaceListing_category_status_idx" ON "MarketplaceListing"("category", "status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_publisherId_idx" ON "MarketplaceListing"("publisherId");

-- CreateIndex
CREATE INDEX "Task_relatedCandidateId_idx" ON "Task"("relatedCandidateId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_relatedCandidateId_fkey" FOREIGN KEY ("relatedCandidateId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_marketplaceInstallId_fkey" FOREIGN KEY ("marketplaceInstallId") REFERENCES "MarketplaceInstall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "MarketplacePublisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "MarketplaceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceVersion" ADD CONSTRAINT "MarketplaceVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceVersion" ADD CONSTRAINT "MarketplaceVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDependency" ADD CONSTRAINT "MarketplaceDependency_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceDependency" ADD CONSTRAINT "MarketplaceDependency_dependsOnListingId_fkey" FOREIGN KEY ("dependsOnListingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_installedByUserId_fkey" FOREIGN KEY ("installedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_uninstalledByUserId_fkey" FOREIGN KEY ("uninstalledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstall" ADD CONSTRAINT "MarketplaceInstall_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceInstallEvent" ADD CONSTRAINT "MarketplaceInstallEvent_installId_fkey" FOREIGN KEY ("installId") REFERENCES "MarketplaceInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_installId_fkey" FOREIGN KEY ("installId") REFERENCES "MarketplaceInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePublisher" ADD CONSTRAINT "MarketplacePublisher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplacePublisher" ADD CONSTRAINT "MarketplacePublisher_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "MarketplaceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_buyerUserId_fkey" FOREIGN KEY ("buyerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_installId_fkey" FOREIGN KEY ("installId") REFERENCES "MarketplaceInstall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOrder" ADD CONSTRAINT "MarketplaceOrder_platformInvoiceId_fkey" FOREIGN KEY ("platformInvoiceId") REFERENCES "PlatformInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOpening" ADD CONSTRAINT "JobOpening_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES "JobOpening"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerUserId_fkey" FOREIGN KEY ("interviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoKeywordResearch" ADD CONSTRAINT "SeoKeywordResearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

