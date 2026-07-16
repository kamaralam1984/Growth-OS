-- CreateEnum
CREATE TYPE "ScheduledJobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ScheduledJobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "logs" JSONB,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJob_key_key" ON "ScheduledJob"("key");

-- CreateIndex
CREATE INDEX "ScheduledJobRun_jobId_startedAt_idx" ON "ScheduledJobRun"("jobId", "startedAt");

-- CreateIndex
CREATE INDEX "ScheduledJobRun_status_idx" ON "ScheduledJobRun"("status");

-- AddForeignKey
ALTER TABLE "ScheduledJobRun" ADD CONSTRAINT "ScheduledJobRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScheduledJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
