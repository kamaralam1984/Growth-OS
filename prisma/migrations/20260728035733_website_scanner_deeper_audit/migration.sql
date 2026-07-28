-- AlterTable
ALTER TABLE "PerformanceAudit" ADD COLUMN     "lazyLoadedImagePct" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "modernImageFormatPct" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "renderBlockingScriptCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SecurityAudit" ADD COLUMN     "corsMisconfigured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exposedSensitiveFileCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasPermissionsPolicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasReferrerPolicy" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tlsAuthorized" BOOLEAN,
ADD COLUMN     "tlsDaysUntilExpiry" INTEGER,
ADD COLUMN     "tlsProtocol" TEXT;

-- AlterTable
ALTER TABLE "UXAudit" ADD COLUMN     "contrastRatio" DOUBLE PRECISION;
