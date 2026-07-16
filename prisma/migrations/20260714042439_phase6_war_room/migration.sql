-- CreateEnum
CREATE TYPE "DecisionCategory" AS ENUM ('PROPOSAL_APPROVAL', 'CLIENT_CONTACT', 'QUOTE_GENERATION', 'MEETING_SCHEDULING', 'ISSUE_ESCALATION', 'GENERAL');

-- AlterEnum
ALTER TYPE "MeetingStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "category" "DecisionCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "notesJson" JSONB,
ADD COLUMN     "relatedLeadId" TEXT;

-- AlterTable
ALTER TABLE "MeetingMessage" ADD COLUMN     "confidenceScore" DOUBLE PRECISION,
ADD COLUMN     "evidence" TEXT,
ADD COLUMN     "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "suggestedAction" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_relatedLeadId_fkey" FOREIGN KEY ("relatedLeadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
