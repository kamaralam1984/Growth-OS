-- CreateEnum
CREATE TYPE "PolicyCategory" AS ENUM ('ACCESS_CONTROL', 'DATA_PROTECTION', 'INCIDENT_RESPONSE', 'BUSINESS_CONTINUITY', 'ACCEPTABLE_USE', 'VENDOR_MANAGEMENT', 'CHANGE_MANAGEMENT', 'RISK_MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('HOSTING', 'PAYMENTS', 'EMAIL_SMS', 'AI_ML', 'ANALYTICS', 'STORAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "VendorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('HARDWARE', 'SOFTWARE', 'CLOUD_SERVICE', 'DATA_STORE', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "SoATheme" AS ENUM ('ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL');

-- CreateEnum
CREATE TYPE "SoAImplementationStatus" AS ENUM ('NOT_IMPLEMENTED', 'PARTIALLY_IMPLEMENTED', 'IMPLEMENTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('FEATURE', 'BUGFIX', 'INFRASTRUCTURE', 'SECURITY', 'CONFIGURATION', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ChangeRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'DEPLOYED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "SecurityPolicy" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "PolicyCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "reviewDueAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VendorCategory" NOT NULL,
    "purpose" TEXT NOT NULL,
    "dataProcessed" TEXT NOT NULL,
    "riskLevel" "VendorRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "dpaSigned" BOOLEAN NOT NULL DEFAULT false,
    "dpaSignedAt" TIMESTAMP(3),
    "dpaReference" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "description" TEXT NOT NULL,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "ownerUserId" TEXT,
    "location" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementOfApplicabilityEntry" (
    "id" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "controlTitle" TEXT NOT NULL,
    "theme" "SoATheme" NOT NULL,
    "applicable" BOOLEAN NOT NULL DEFAULT true,
    "justification" TEXT NOT NULL,
    "implementationStatus" "SoAImplementationStatus" NOT NULL DEFAULT 'NOT_IMPLEMENTED',
    "evidenceReference" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementOfApplicabilityEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "riskLevel" "ChangeRiskLevel" NOT NULL DEFAULT 'LOW',
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'PROPOSED',
    "rollbackPlan" TEXT,
    "requestedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "deployedAt" TIMESTAMP(3),
    "deploymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityPolicy_status_category_idx" ON "SecurityPolicy"("status", "category");

-- CreateIndex
CREATE INDEX "VendorRecord_category_active_idx" ON "VendorRecord"("category", "active");

-- CreateIndex
CREATE INDEX "VendorRecord_dpaSigned_active_idx" ON "VendorRecord"("dpaSigned", "active");

-- CreateIndex
CREATE INDEX "AssetRecord_assetType_status_idx" ON "AssetRecord"("assetType", "status");

-- CreateIndex
CREATE INDEX "AssetRecord_classification_idx" ON "AssetRecord"("classification");

-- CreateIndex
CREATE UNIQUE INDEX "StatementOfApplicabilityEntry_controlId_key" ON "StatementOfApplicabilityEntry"("controlId");

-- CreateIndex
CREATE INDEX "StatementOfApplicabilityEntry_theme_applicable_idx" ON "StatementOfApplicabilityEntry"("theme", "applicable");

-- CreateIndex
CREATE INDEX "ChangeRequest_status_riskLevel_idx" ON "ChangeRequest"("status", "riskLevel");

-- AddForeignKey
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
