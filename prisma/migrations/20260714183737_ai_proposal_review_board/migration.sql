-- CreateEnum
CREATE TYPE "BoardReviewDecision" AS ENUM ('APPROVED', 'APPROVED_WITH_CHANGES', 'NEEDS_REVISION', 'REJECTED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "PaymentRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ApprovalPolicyMode" AS ENUM ('ADVISORY', 'APPROVAL_REQUIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'FINANCE';
ALTER TYPE "AgentType" ADD VALUE 'LEGAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DecisionCategory" ADD VALUE 'QUOTATION_APPROVAL';
ALTER TYPE "DecisionCategory" ADD VALUE 'CONTRACT_APPROVAL';
ALTER TYPE "DecisionCategory" ADD VALUE 'INVOICE_APPROVAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'BOARD_REVIEW_STARTED';
ALTER TYPE "NotificationType" ADD VALUE 'BOARD_REVIEW_COMPLETED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecommendationType" ADD VALUE 'SCOPE_IMPROVEMENT';
ALTER TYPE "RecommendationType" ADD VALUE 'PROPOSAL_QUALITY_IMPROVEMENT';
ALTER TYPE "RecommendationType" ADD VALUE 'COMPETITIVE_ADVANTAGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VoteChoice" ADD VALUE 'APPROVE_WITH_CHANGES';
ALTER TYPE "VoteChoice" ADD VALUE 'REQUEST_REVISION';

-- AlterTable
ALTER TABLE "MeetingMessage" ADD COLUMN     "reviewJson" JSONB;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "relatedContractId" TEXT,
ADD COLUMN     "relatedInvoiceId" TEXT,
ADD COLUMN     "relatedMeetingId" TEXT,
ADD COLUMN     "relatedQuotationId" TEXT;

-- CreateTable
CREATE TABLE "BoardReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "decisionId" TEXT,
    "docKind" "DocumentKind" NOT NULL,
    "docId" TEXT NOT NULL,
    "finalDecision" "BoardReviewDecision",
    "overallConfidence" DOUBLE PRECISION,
    "winProbability" DOUBLE PRECISION,
    "requestedByUserId" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "overriddenByUserId" TEXT,
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAnalysis" (
    "id" TEXT NOT NULL,
    "boardReviewId" TEXT NOT NULL,
    "contractTermsOk" BOOLEAN,
    "missingClauses" TEXT[],
    "ndaRequired" BOOLEAN,
    "liabilityRisk" TEXT,
    "warrantyRisk" TEXT,
    "complianceNotes" TEXT,
    "overallRiskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "riskFactors" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitAnalysis" (
    "id" TEXT NOT NULL,
    "boardReviewId" TEXT NOT NULL,
    "estimatedRevenue" DOUBLE PRECISION,
    "estimatedCost" DOUBLE PRECISION,
    "grossMargin" DOUBLE PRECISION,
    "netMargin" DOUBLE PRECISION,
    "profit" DOUBLE PRECISION,
    "discountImpact" DOUBLE PRECISION,
    "paymentRiskLevel" "PaymentRiskLevel" NOT NULL DEFAULT 'LOW',
    "paymentRiskNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationApprovalPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mode" "ApprovalPolicyMode" NOT NULL DEFAULT 'ADVISORY',
    "appliesToDocKinds" "DocumentKind"[],
    "allowOwnerOverride" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationApprovalPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardReview_meetingId_key" ON "BoardReview"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardReview_decisionId_key" ON "BoardReview"("decisionId");

-- CreateIndex
CREATE INDEX "BoardReview_organizationId_idx" ON "BoardReview"("organizationId");

-- CreateIndex
CREATE INDEX "BoardReview_docKind_docId_idx" ON "BoardReview"("docKind", "docId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAnalysis_boardReviewId_key" ON "RiskAnalysis"("boardReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitAnalysis_boardReviewId_key" ON "ProfitAnalysis"("boardReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationApprovalPolicy_organizationId_key" ON "OrganizationApprovalPolicy"("organizationId");

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedQuotationId_fkey" FOREIGN KEY ("relatedQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedContractId_fkey" FOREIGN KEY ("relatedContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedInvoiceId_fkey" FOREIGN KEY ("relatedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedMeetingId_fkey" FOREIGN KEY ("relatedMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReview" ADD CONSTRAINT "BoardReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReview" ADD CONSTRAINT "BoardReview_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReview" ADD CONSTRAINT "BoardReview_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReview" ADD CONSTRAINT "BoardReview_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReview" ADD CONSTRAINT "BoardReview_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAnalysis" ADD CONSTRAINT "RiskAnalysis_boardReviewId_fkey" FOREIGN KEY ("boardReviewId") REFERENCES "BoardReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitAnalysis" ADD CONSTRAINT "ProfitAnalysis_boardReviewId_fkey" FOREIGN KEY ("boardReviewId") REFERENCES "BoardReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApprovalPolicy" ADD CONSTRAINT "OrganizationApprovalPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationApprovalPolicy" ADD CONSTRAINT "OrganizationApprovalPolicy_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

