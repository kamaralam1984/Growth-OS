-- CreateEnum
CREATE TYPE "DeliveryReportType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'PROJECT_HEALTH', 'RISK');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AgentType" ADD VALUE 'QA_DIRECTOR';
ALTER TYPE "AgentType" ADD VALUE 'DEVOPS_DIRECTOR';
ALTER TYPE "AgentType" ADD VALUE 'DELIVERY_DIRECTOR';

-- AlterEnum
ALTER TYPE "DecisionCategory" ADD VALUE 'PROJECT_DELIVERY';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DELIVERY_HEALTH_DROPPED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProjectRiskCategory" ADD VALUE 'DEVELOPER_OVERLOAD';
ALTER TYPE "ProjectRiskCategory" ADD VALUE 'QA_FAILURE';
ALTER TYPE "ProjectRiskCategory" ADD VALUE 'SECURITY_ISSUE';
ALTER TYPE "ProjectRiskCategory" ADD VALUE 'DEPLOYMENT_RISK';

-- AlterEnum
ALTER TYPE "RecommendationType" ADD VALUE 'DELIVERY_RECOMMENDATION';

-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'BUG';

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "deadlineImpactDays" INTEGER,
ADD COLUMN     "financialImpact" DOUBLE PRECISION,
ADD COLUMN     "riskLevel" "RiskLevel";

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "relatedProjectId" TEXT;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "relatedProjectId" TEXT;

-- CreateTable
CREATE TABLE "ProjectHealthSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "deliveryScore" INTEGER NOT NULL,
    "qualityScore" INTEGER NOT NULL,
    "velocityScore" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "budgetScore" INTEGER NOT NULL,
    "customerHappinessScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "type" "DeliveryReportType" NOT NULL,
    "summary" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL,
    "createdByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectHealthSnapshot_organizationId_date_idx" ON "ProjectHealthSnapshot"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectHealthSnapshot_projectId_date_key" ON "ProjectHealthSnapshot"("projectId", "date");

-- CreateIndex
CREATE INDEX "DeliveryReport_organizationId_idx" ON "DeliveryReport"("organizationId");

-- CreateIndex
CREATE INDEX "DeliveryReport_projectId_idx" ON "DeliveryReport"("projectId");

-- CreateIndex
CREATE INDEX "Meeting_relatedProjectId_idx" ON "Meeting"("relatedProjectId");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHealthSnapshot" ADD CONSTRAINT "ProjectHealthSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectHealthSnapshot" ADD CONSTRAINT "ProjectHealthSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

