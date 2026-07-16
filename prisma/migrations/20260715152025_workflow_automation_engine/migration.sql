-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowNodeType" AS ENUM ('TRIGGER', 'CONDITION', 'DELAY', 'LOOP', 'AI_ACTION', 'EMAIL', 'SMS', 'WEBHOOK', 'CRM', 'PROPOSAL', 'PROJECT', 'APPROVAL', 'DOCUMENT', 'NOTIFICATION', 'DATABASE', 'FUNCTION', 'CUSTOM_API');

-- CreateEnum
CREATE TYPE "SecretCategory" AS ENUM ('API_KEY', 'OAUTH_SECRET', 'JWT_SECRET', 'SMTP_CREDENTIAL', 'DATABASE_CREDENTIAL', 'ENCRYPTION_KEY', 'OTHER');

-- CreateEnum
CREATE TYPE "WebhookDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AutomationTrigger" ADD VALUE 'LEAD_UPDATED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'PROJECT_CREATED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CLIENT_MESSAGE';
ALTER TYPE "AutomationTrigger" ADD VALUE 'MEETING_SCHEDULED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'WEBHOOK_RECEIVED';
ALTER TYPE "AutomationTrigger" ADD VALUE 'TIMER';
ALTER TYPE "AutomationTrigger" ADD VALUE 'CRON';
ALTER TYPE "AutomationTrigger" ADD VALUE 'MANUAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationCategory" ADD VALUE 'CRM_SYNC';
ALTER TYPE "IntegrationCategory" ADD VALUE 'COMMUNICATION';
ALTER TYPE "IntegrationCategory" ADD VALUE 'STORAGE';
ALTER TYPE "IntegrationCategory" ADD VALUE 'PAYMENTS';
ALTER TYPE "IntegrationCategory" ADD VALUE 'ACCOUNTING';
ALTER TYPE "IntegrationCategory" ADD VALUE 'MEETINGS';
ALTER TYPE "IntegrationCategory" ADD VALUE 'DEVELOPMENT';
ALTER TYPE "IntegrationCategory" ADD VALUE 'AI_PROVIDER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IntegrationProviderKey" ADD VALUE 'SENDGRID';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'MAILGUN';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'AMAZON_SES';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'CAL_COM';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'CALENDLY';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'HUBSPOT';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'SALESFORCE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'ZOHO_CRM';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'PIPEDRIVE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'FRESHSALES';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'SLACK';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'MICROSOFT_TEAMS';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'DISCORD';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'TELEGRAM';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'TWILIO';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GOOGLE_DRIVE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'DROPBOX';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'ONEDRIVE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'AWS_S3';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'CLOUDFLARE_R2';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'STRIPE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'RAZORPAY';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'PAYPAL';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'PADDLE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'LEMONSQUEEZY';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'QUICKBOOKS';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'XERO';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'ZOHO_BOOKS';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'ZOOM';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GOOGLE_MEET';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GITHUB';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GITLAB';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'BITBUCKET';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'VERCEL';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'NETLIFY';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'CLOUDFLARE';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'OPENAI';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GOOGLE_GEMINI';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'DEEPSEEK';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'GROQ';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'OPENROUTER';
ALTER TYPE "IntegrationProviderKey" ADD VALUE 'OLLAMA';

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "isAIGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiPrompt" TEXT,
    "createdByUserId" TEXT,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeType" "WorkflowNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "position" JSONB NOT NULL,
    "nextStepId" TEXT,
    "onTrueStepId" TEXT,
    "onFalseStepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "triggerPayload" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "queueJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStepRun" (
    "id" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "workflowStepId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowStepRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "icon" TEXT,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" "AutomationTrigger" NOT NULL,
    "triggerConfig" JSONB,
    "stepsBlueprint" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replayedAt" TIMESTAMP(3),
    "replayCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secret" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" "SecretCategory" NOT NULL DEFAULT 'OTHER',
    "encryptedValue" TEXT NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "lastRotatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "integrationConnectionId" TEXT,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTimeMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "APIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workflowId" TEXT,
    "direction" "WebhookDirection" NOT NULL,
    "slug" TEXT,
    "targetUrl" TEXT,
    "encryptedSecret" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "direction" "WebhookDirection" NOT NULL,
    "payload" JSONB NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Workflow_organizationId_status_idx" ON "Workflow"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_nextStepId_key" ON "WorkflowStep"("nextStepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_onTrueStepId_key" ON "WorkflowStep"("onTrueStepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStep_onFalseStepId_key" ON "WorkflowStep"("onFalseStepId");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_status_idx" ON "WorkflowRun"("workflowId", "status");

-- CreateIndex
CREATE INDEX "WorkflowRun_organizationId_createdAt_idx" ON "WorkflowRun"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowStepRun_workflowRunId_idx" ON "WorkflowStepRun"("workflowRunId");

-- CreateIndex
CREATE INDEX "EventLog_organizationId_eventType_publishedAt_idx" ON "EventLog"("organizationId", "eventType", "publishedAt");

-- CreateIndex
CREATE INDEX "Secret_organizationId_idx" ON "Secret"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Secret_organizationId_key_key" ON "Secret"("organizationId", "key");

-- CreateIndex
CREATE INDEX "APIUsage_organizationId_createdAt_idx" ON "APIUsage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "APIUsage_apiKeyId_idx" ON "APIUsage"("apiKeyId");

-- CreateIndex
CREATE INDEX "APIUsage_integrationConnectionId_idx" ON "APIUsage"("integrationConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_slug_key" ON "Webhook"("slug");

-- CreateIndex
CREATE INDEX "Webhook_organizationId_idx" ON "Webhook"("organizationId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx" ON "WebhookDelivery"("webhookId", "createdAt");

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_nextStepId_fkey" FOREIGN KEY ("nextStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_onTrueStepId_fkey" FOREIGN KEY ("onTrueStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_onFalseStepId_fkey" FOREIGN KEY ("onFalseStepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStepRun" ADD CONSTRAINT "WorkflowStepRun_workflowStepId_fkey" FOREIGN KEY ("workflowStepId") REFERENCES "WorkflowStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIUsage" ADD CONSTRAINT "APIUsage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
