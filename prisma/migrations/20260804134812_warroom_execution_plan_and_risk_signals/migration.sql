-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "expectedImpact" TEXT,
ADD COLUMN     "kpi" TEXT,
ADD COLUMN     "priority" "MessagePriority" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "expectedImpact" TEXT,
ADD COLUMN     "kpi" TEXT;
