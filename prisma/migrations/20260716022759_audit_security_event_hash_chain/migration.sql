-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "previousHash" TEXT;

-- AlterTable
ALTER TABLE "SecurityEvent" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "previousHash" TEXT;
