-- CreateEnum
CREATE TYPE "SalesInquiryDepartment" AS ENUM ('SALES', 'ENTERPRISE', 'GOVERNMENT', 'SUPPORT', 'PARTNERSHIP', 'INVESTOR', 'CAREER');

-- CreateEnum
CREATE TYPE "SalesInquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "MarketingEventType" AS ENUM ('CTA_CLICK', 'VIDEO_MODAL_OPEN', 'SCROLL_DEPTH', 'FORM_SUBMIT', 'PAGE_VIEW');

-- CreateTable
CREATE TABLE "SalesInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "businessEmail" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "department" "SalesInquiryDepartment" NOT NULL,
    "industry" TEXT,
    "employeeCount" TEXT,
    "budget" TEXT,
    "timeline" TEXT,
    "projectType" TEXT,
    "message" TEXT NOT NULL,
    "sourcePage" TEXT,
    "referrer" TEXT,
    "status" "SalesInquiryStatus" NOT NULL DEFAULT 'NEW',
    "consentGiven" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingEvent" (
    "id" TEXT NOT NULL,
    "eventType" "MarketingEventType" NOT NULL,
    "page" TEXT NOT NULL,
    "label" TEXT,
    "metadata" JSONB,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesInquiry_status_createdAt_idx" ON "SalesInquiry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SalesInquiry_department_createdAt_idx" ON "SalesInquiry"("department", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_eventType_createdAt_idx" ON "MarketingEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "MarketingEvent_page_createdAt_idx" ON "MarketingEvent"("page", "createdAt");
