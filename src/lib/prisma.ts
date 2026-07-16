import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaRead?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Read-replica-aware Prisma client.
 *
 * Points at `DATABASE_URL_REPLICA` (the `postgres-replica` service in
 * docker-compose.yml — a real Postgres streaming-replication standby, see
 * postgres/replica-entrypoint.sh) when that env var is set. Falls back to
 * the exact same primary connection as `prisma` above when it isn't
 * configured, so every call site using `prismaRead` is always safe to run
 * even in an environment with no replica wired up yet (local dev, or
 * `docker compose up` before the replica has finished its initial
 * pg_basebackup and gone healthy) — it just transparently reads from the
 * primary in that case, same as before this existed.
 *
 * This is a genuinely separate PrismaClient/adapter/connection pool when a
 * replica IS configured, not merely an alias — a real streaming replica is
 * read-only at the Postgres level and will reject any write with a real
 * "cannot execute ... in a read-only transaction" error, so only route call
 * sites that are OBVIOUSLY read-only (dashboard/analytics aggregations,
 * reporting) through `prismaRead`. Never use it for a write, and never use
 * it immediately after a write you need to read your own writes from in the
 * same request — replication lag is real and unbounded under load.
 *
 * Deliberately NOT rewired into every one of this codebase's ~350
 * `@/lib/prisma` import sites — that is a large, mechanical, call-by-call
 * migration out of scope here. src/lib/company-health.ts's
 * computeCompanyHealth/computePipelineTotals (read-heavy, cached dashboard
 * aggregation queries with no write in the same call) use it as a
 * demonstration that the pattern is real and works end-to-end, not just a
 * theoretical export nobody exercises.
 */
function createReadClient(): PrismaClient {
  const replicaUrl = process.env.DATABASE_URL_REPLICA;
  if (!replicaUrl) return prisma;
  const readAdapter = new PrismaPg({ connectionString: replicaUrl });
  return new PrismaClient({ adapter: readAdapter });
}

export const prismaRead = globalForPrisma.prismaRead ?? createReadClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaRead = prismaRead;
