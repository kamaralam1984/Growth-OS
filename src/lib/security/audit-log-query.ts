import { prisma } from "@/lib/prisma";
import type { AuditLog, Prisma } from "@/generated/prisma/client";

export interface AuditLogFilter {
  organizationId?: string;
  userId?: string;
  action?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

const PAGE_SIZE = 100;

export type AuditLogRow = AuditLog & {
  user: { name: string | null; email: string | null } | null;
  organization: { name: string } | null;
};

/** Cross-org, filterable audit log query — platform-owner only (see /admin/audit-log). */
export async function queryAuditLog(filter: AuditLogFilter): Promise<AuditLogRow[]> {
  const where: Prisma.AuditLogWhereInput = {};
  if (filter.organizationId) where.organizationId = filter.organizationId;
  if (filter.userId) where.userId = filter.userId;
  if (filter.action) where.action = { contains: filter.action, mode: "insensitive" };
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {
      ...(filter.dateFrom ? { gte: filter.dateFrom } : {}),
      ...(filter.dateTo ? { lte: filter.dateTo } : {}),
    };
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: {
      user: { select: { name: true, email: true } },
      organization: { select: { name: true } },
    },
  });
}

/** Distinct real action strings actually present, to drive a filter dropdown honestly (never a hardcoded list that drifts from what's actually logged). */
export async function listDistinctAuditActions(limit = 200): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
    take: limit,
  });
  return rows.map((r) => r.action);
}
