import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Hash-chained tamper-evidence for AuditLog and SecurityEvent.
 *
 * Every row's `hash` is sha256(previousHash + canonicalized row content),
 * where `previousHash` is the `hash` of the most recent prior row in the
 * same chain scope (see `chainScope` below), or GENESIS_HASH for the first
 * row in that scope. Rewriting or deleting a row's content directly in the
 * database (bypassing logAudit()/logSecurityEvent(), which never expose an
 * update or delete) breaks the hash link to every row written after it in
 * that scope — `verifyAuditLogChain`/`verifySecurityEventChain` below walk
 * the chain forward and report the first row whose stored `hash` no longer
 * matches its recomputed value.
 *
 * Honest limitation: this is tamper-EVIDENCE, not a database-enforced
 * append-only guarantee (there is no such guarantee at the Postgres level
 * here — see each model's doc comment in prisma/schema.prisma). A
 * sufficiently privileged database user can still rewrite a row and every
 * hash after it so the chain re-verifies; this only guarantees that
 * tampering which does NOT also rewrite the rest of the chain is
 * detectable. It also does not defend against a race between two
 * concurrent writes to the *same* scope both reading the same "latest"
 * row as their previousHash — under high write concurrency in one
 * organization, this can fork the chain rather than serialize it. A full
 * guarantee against either would need database-level append-only
 * enforcement (e.g. a REVOKE UPDATE/DELETE + trigger, or a WORM store) and
 * per-scope serialization (e.g. a Postgres advisory lock), neither of
 * which this pass adds.
 */

export const GENESIS_HASH = "genesis";

/** Rows in different `organizationId` scopes are independent chains; `null` (no organization) is its own shared scope. */
function chainScopeWhere(organizationId: string | null) {
  return { organizationId };
}

function canonicalize(content: Record<string, unknown>): string {
  const sortedKeys = Object.keys(content).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of sortedKeys) ordered[key] = content[key] ?? null;
  return JSON.stringify(ordered);
}

function computeHash(previousHash: string, content: Record<string, unknown>): string {
  return createHash("sha256").update(`${previousHash}|${canonicalize(content)}`).digest("hex");
}

export interface AuditLogHashInput {
  userId: string | null;
  organizationId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.InputJsonValue | null;
  createdAt: Date;
}

export interface ChainedFields {
  previousHash: string;
  hash: string;
}

/** Computes the next {previousHash, hash} pair for a new AuditLog row — call this immediately before `prisma.auditLog.create`. */
export async function nextAuditLogHash(input: AuditLogHashInput): Promise<ChainedFields> {
  const previous = await prisma.auditLog.findFirst({
    where: chainScopeWhere(input.organizationId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const previousHash = previous?.hash ?? GENESIS_HASH;
  const hash = computeHash(previousHash, {
    userId: input.userId,
    organizationId: input.organizationId,
    action: input.action,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata,
    createdAt: input.createdAt.toISOString(),
  });
  return { previousHash, hash };
}

export interface SecurityEventHashInput {
  userId: string | null;
  organizationId: string | null;
  type: string;
  severity: string;
  ipAddress: string | null;
  userAgent: string | null;
  detail: string | null;
  metadata: Prisma.InputJsonValue | null;
  createdAt: Date;
}

/** Computes the next {previousHash, hash} pair for a new SecurityEvent row — call this immediately before `prisma.securityEvent.create`. */
export async function nextSecurityEventHash(input: SecurityEventHashInput): Promise<ChainedFields> {
  const previous = await prisma.securityEvent.findFirst({
    where: chainScopeWhere(input.organizationId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { hash: true },
  });
  const previousHash = previous?.hash ?? GENESIS_HASH;
  const hash = computeHash(previousHash, {
    userId: input.userId,
    organizationId: input.organizationId,
    type: input.type,
    severity: input.severity,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    detail: input.detail,
    metadata: input.metadata,
    createdAt: input.createdAt.toISOString(),
  });
  return { previousHash, hash };
}

export interface ChainVerificationResult {
  ok: boolean;
  checked: number;
  /** id of the first row whose stored hash doesn't match its recomputed value, if any. */
  firstBrokenId?: string;
  reason?: string;
}

/**
 * Walks the AuditLog chain for one organization scope (pass `null` for the
 * no-organization scope) oldest-to-newest, recomputing each row's hash from
 * its stored content and the previous row's stored hash, and reports the
 * first row where the recomputed hash disagrees with what's stored — proof
 * that row (or an earlier one whose hash it depends on) was altered outside
 * logAudit(). Rows written before this hash chain existed have `hash: null`
 * and are skipped as the (unverifiable) start of the visible chain.
 */
export async function verifyAuditLogChain(organizationId: string | null): Promise<ChainVerificationResult> {
  const rows = await prisma.auditLog.findMany({
    where: chainScopeWhere(organizationId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      organizationId: true,
      action: true,
      ipAddress: true,
      userAgent: true,
      metadata: true,
      createdAt: true,
      previousHash: true,
      hash: true,
    },
  });

  let expectedPreviousHash = GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    if (row.hash == null) {
      // Pre-hash-chain row (written before this migration) — not
      // verifiable, but also doesn't invalidate rows written after it
      // re-enter the chain from here.
      expectedPreviousHash = GENESIS_HASH;
      continue;
    }
    if (row.previousHash !== expectedPreviousHash) {
      return { ok: false, checked, firstBrokenId: row.id, reason: "previousHash does not match the prior row's hash" };
    }
    const recomputed = computeHash(expectedPreviousHash, {
      userId: row.userId,
      organizationId: row.organizationId,
      action: row.action,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      metadata: row.metadata as Prisma.InputJsonValue | null,
      createdAt: row.createdAt.toISOString(),
    });
    if (recomputed !== row.hash) {
      return { ok: false, checked, firstBrokenId: row.id, reason: "stored hash does not match recomputed content hash" };
    }
    expectedPreviousHash = row.hash;
    checked++;
  }
  return { ok: true, checked };
}

/** Same walk as `verifyAuditLogChain`, for SecurityEvent. */
export async function verifySecurityEventChain(organizationId: string | null): Promise<ChainVerificationResult> {
  const rows = await prisma.securityEvent.findMany({
    where: chainScopeWhere(organizationId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      organizationId: true,
      type: true,
      severity: true,
      ipAddress: true,
      userAgent: true,
      detail: true,
      metadata: true,
      createdAt: true,
      previousHash: true,
      hash: true,
    },
  });

  let expectedPreviousHash = GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    if (row.hash == null) {
      expectedPreviousHash = GENESIS_HASH;
      continue;
    }
    if (row.previousHash !== expectedPreviousHash) {
      return { ok: false, checked, firstBrokenId: row.id, reason: "previousHash does not match the prior row's hash" };
    }
    const recomputed = computeHash(expectedPreviousHash, {
      userId: row.userId,
      organizationId: row.organizationId,
      type: row.type,
      severity: row.severity,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      detail: row.detail,
      metadata: row.metadata as Prisma.InputJsonValue | null,
      createdAt: row.createdAt.toISOString(),
    });
    if (recomputed !== row.hash) {
      return { ok: false, checked, firstBrokenId: row.id, reason: "stored hash does not match recomputed content hash" };
    }
    expectedPreviousHash = row.hash;
    checked++;
  }
  return { ok: true, checked };
}
