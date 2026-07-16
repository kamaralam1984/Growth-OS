import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nextAuditLogHash } from "@/lib/audit-chain-verify";

export interface LogAuditInput {
  userId?: string | null;
  organizationId?: string | null;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Thin wrapper around AuditLog creation. Audit logging must never break the
 * calling request, so any failure is swallowed and reported to console.error
 * only — callers should not (and do not need to) await-guard this themselves.
 *
 * Every row is written as part of a hash chain (previousHash/hash — see
 * src/lib/audit-chain-verify.ts) so a row altered directly in the database
 * later, outside this create-only function, is detectable by re-walking the
 * chain — tamper-evidence, not a DB-enforced append-only guarantee.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const userId = input.userId ?? null;
    const organizationId = input.organizationId ?? null;
    const ipAddress = input.ipAddress ?? null;
    const userAgent = input.userAgent ?? null;
    const metadata = (input.metadata as Prisma.InputJsonValue | null) ?? null;
    const createdAt = new Date();

    const { previousHash, hash } = await nextAuditLogHash({
      userId,
      organizationId,
      action: input.action,
      ipAddress,
      userAgent,
      metadata,
      createdAt,
    });

    await prisma.auditLog.create({
      data: {
        userId: userId ?? undefined,
        organizationId: organizationId ?? undefined,
        action: input.action,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
        metadata: metadata ?? undefined,
        createdAt,
        previousHash,
        hash,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit log:", error);
  }
}
