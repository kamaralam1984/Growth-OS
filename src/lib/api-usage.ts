import { prisma } from "@/lib/prisma";

export interface RecordAPIUsageInput {
  organizationId: string;
  apiKeyId?: string;
  integrationConnectionId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTimeMs: number;
}

/** Fire-and-forget usage log — never throws, matching logActivity/notifyUser. */
export async function recordAPIUsage(input: RecordAPIUsageInput): Promise<void> {
  try {
    await prisma.aPIUsage.create({
      data: {
        organizationId: input.organizationId,
        apiKeyId: input.apiKeyId,
        integrationConnectionId: input.integrationConnectionId,
        endpoint: input.endpoint,
        method: input.method,
        statusCode: input.statusCode,
        responseTimeMs: input.responseTimeMs,
      },
    });
  } catch (error) {
    console.error("[api-usage] failed to record API usage:", error);
  }
}

export interface UsageSummary {
  totalCalls: number;
  errorRate: number;
  avgResponseTimeMs: number;
  byEndpoint: Array<{ endpoint: string; count: number }>;
}

export async function getUsageSummary(organizationId: string, days = 30): Promise<UsageSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { organizationId, createdAt: { gte: since } };

  const [aggregate, errorCount, byEndpoint] = await Promise.all([
    prisma.aPIUsage.aggregate({ where, _count: { _all: true }, _avg: { responseTimeMs: true } }),
    prisma.aPIUsage.count({ where: { ...where, statusCode: { gte: 400 } } }),
    prisma.aPIUsage.groupBy({
      by: ["endpoint"],
      where,
      _count: { _all: true },
      orderBy: { _count: { endpoint: "desc" } },
    }),
  ]);

  const totalCalls = aggregate._count._all;
  return {
    totalCalls,
    errorRate: totalCalls > 0 ? errorCount / totalCalls : 0,
    avgResponseTimeMs: aggregate._avg.responseTimeMs ?? 0,
    byEndpoint: byEndpoint.map((row) => ({ endpoint: row.endpoint, count: row._count._all })),
  };
}

export interface UsageTimeSeriesPoint {
  date: string;
  count: number;
  errorCount: number;
}

interface UsageTimeSeriesRow {
  date: Date;
  count: bigint;
  errorCount: bigint;
}

/**
 * Real daily call/error counts for the last `days` days. Prisma's query
 * builder has no group-by-truncated-date primitive, so this drops to raw
 * SQL — but via Prisma's `$queryRaw` tagged template, which parameterizes
 * every interpolated value as a bound placeholder rather than splicing it
 * into the SQL text. `organizationId`/`since` are never string-concatenated
 * into the query, so this carries no SQL-injection risk even though neither
 * value is directly user-supplied.
 */
export async function getUsageTimeSeries(organizationId: string, days = 30): Promise<UsageTimeSeriesPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<UsageTimeSeriesRow[]>`
    SELECT
      date_trunc('day', "createdAt") AS date,
      COUNT(*)::bigint AS count,
      COUNT(*) FILTER (WHERE "statusCode" >= 400)::bigint AS "errorCount"
    FROM "APIUsage"
    WHERE "organizationId" = ${organizationId}
      AND "createdAt" >= ${since}
    GROUP BY date_trunc('day', "createdAt")
    ORDER BY date ASC
  `;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    count: Number(row.count),
    errorCount: Number(row.errorCount),
  }));
}

export interface ApiKeyUsageBreakdown {
  apiKeyId: string;
  keyName: string;
  count: number;
  errorCount: number;
  avgResponseTimeMs: number;
}

/** Real per-key usage — groupBy on apiKeyId, joined against ApiKey.name for display. */
export async function getUsageByApiKey(organizationId: string, days = 30): Promise<ApiKeyUsageBreakdown[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { organizationId, createdAt: { gte: since }, apiKeyId: { not: null } } as const;

  const [byKey, errorByKey] = await Promise.all([
    prisma.aPIUsage.groupBy({
      by: ["apiKeyId"],
      where,
      _count: { _all: true },
      _avg: { responseTimeMs: true },
      orderBy: { _count: { apiKeyId: "desc" } },
    }),
    prisma.aPIUsage.groupBy({
      by: ["apiKeyId"],
      where: { ...where, statusCode: { gte: 400 } },
      _count: { _all: true },
    }),
  ]);

  const apiKeyIds = byKey.map((row) => row.apiKeyId).filter((id): id is string => id != null);
  const apiKeys = apiKeyIds.length
    ? await prisma.apiKey.findMany({ where: { id: { in: apiKeyIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(apiKeys.map((key) => [key.id, key.name]));
  const errorCountById = new Map(errorByKey.map((row) => [row.apiKeyId, row._count._all]));

  return byKey
    .filter((row): row is typeof row & { apiKeyId: string } => row.apiKeyId != null)
    .map((row) => ({
      apiKeyId: row.apiKeyId,
      keyName: nameById.get(row.apiKeyId) ?? "(deleted key)",
      count: row._count._all,
      errorCount: errorCountById.get(row.apiKeyId) ?? 0,
      avgResponseTimeMs: row._avg.responseTimeMs ?? 0,
    }));
}
