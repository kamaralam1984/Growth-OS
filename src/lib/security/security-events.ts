import { prisma } from "@/lib/prisma";
import type { Prisma, SecurityEventSeverity, SecurityEventType } from "@/generated/prisma/client";
import { ensureIncidentForCriticalEvent } from "@/lib/security/incidents";
import { nextSecurityEventHash } from "@/lib/audit-chain-verify";

/**
 * Real, immutable security-event logging — create-only, never updated or
 * deleted by application code (matching AuditLog's existing discipline).
 * Distinct from AuditLog (general "what happened" business actions):
 * SecurityEvent specifically feeds the Security tab of the Production
 * Dashboard and the SystemAlert pipeline for CRITICAL-severity events.
 * Fire-and-forget — a logging failure must never break the real request
 * that triggered it.
 */
export interface LogSecurityEventInput {
  userId?: string;
  organizationId?: string;
  type: SecurityEventType;
  severity?: SecurityEventSeverity;
  ipAddress?: string | null;
  userAgent?: string | null;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(input: LogSecurityEventInput): Promise<void> {
  const severity = input.severity ?? "INFO";
  try {
    const userId = input.userId ?? null;
    const organizationId = input.organizationId ?? null;
    const ipAddress = input.ipAddress ?? null;
    const userAgent = input.userAgent ?? null;
    const detail = input.detail ?? null;
    const metadata = (input.metadata as Prisma.InputJsonValue | undefined) ?? null;
    const createdAt = new Date();

    // Same hash-chain scheme as AuditLog (src/lib/audit-chain-verify.ts) —
    // tamper-evidence for a create-only model, not a DB-enforced
    // append-only guarantee.
    const { previousHash, hash } = await nextSecurityEventHash({
      userId,
      organizationId,
      type: input.type,
      severity,
      ipAddress,
      userAgent,
      detail,
      metadata,
      createdAt,
    });

    await prisma.securityEvent.create({
      data: {
        userId: userId ?? undefined,
        organizationId: organizationId ?? undefined,
        type: input.type,
        severity,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
        detail: detail ?? undefined,
        metadata: metadata ?? undefined,
        createdAt,
        previousHash,
        hash,
      },
    });
  } catch (error) {
    console.error("[security/security-events] logSecurityEvent failed:", error);
  }

  // Real auto-incident trigger: every CRITICAL-severity SecurityEvent opens
  // (or appends to an already-open) Incident — see
  // src/lib/security/incidents.ts's ensureIncidentForCriticalEvent doc
  // comment for why this lives as a separate call site here rather than
  // inline business logic inside the create() above. Deliberately NOT
  // awaited into the same try block: this must never turn a security-event
  // logging failure into an incident-creation failure or vice versa, and
  // must never delay/break the real request that triggered the original
  // event.
  if (severity === "CRITICAL") {
    void ensureIncidentForCriticalEvent({ type: input.type, detail: input.detail });
  }
}

/**
 * Real brute-force detection — counts actual LOGIN_FAILED SecurityEvent
 * rows for this identity+IP within a real trailing window. Distinct from
 * (and a genuine additional signal on top of) the existing rolling
 * rate-limiter + persistent User.lockedUntil lockout already enforced in
 * src/auth.ts — this is for cross-referencing/alerting (e.g. escalating to
 * a CRITICAL SystemAlert), not a replacement for that real, already-working
 * enforcement.
 */
export async function countRecentFailedLogins(identity: string, ipAddress: string | null, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return prisma.securityEvent.count({
    where: {
      type: "LOGIN_FAILED",
      createdAt: { gte: since },
      OR: [{ detail: identity }, ...(ipAddress ? [{ ipAddress }] : [])],
    },
  });
}
