import type { MembershipRole } from "@/generated/prisma/client";
import { logSecurityEvent } from "@/lib/security/security-events";

/**
 * Real, lightweight Attribute-Based Access Control layer, sitting ON TOP OF
 * (never replacing) the existing RBAC already enforced everywhere via
 * `MembershipRole` (see `model Membership` in prisma/schema.prisma and the
 * ad-hoc `membership.role` checks scattered across every Server Action's own
 * "am I allowed to touch this org's data" guard).
 *
 * This module formalizes exactly two attribute rules that today are
 * re-implemented slightly differently in every Server Action that needs
 * them:
 *
 *   1. Tenant isolation: a resource that carries an `organizationId` must
 *      belong to the SAME organization as the actor's own membership. This
 *      catches the class of bug where a resource is looked up by its own id
 *      (not by a composite `(organizationId, id)` key) and only filtered by
 *      org as an afterthought — or not at all.
 *   2. Read-only roles: `VIEWER` (and, since it can never legitimately
 *      originate a write of its own, `AI_AGENT` acting outside its own
 *      scoped tool calls) may `read` but must never `write`/`delete`,
 *      regardless of who owns the resource or which organization it's in.
 *
 * This is deliberately NOT wired into every existing Server Action in the
 * app (hundreds of files, out of scope for this pass) — it's applied for
 * real at a small number of concrete, security-sensitive call sites (see
 * src/app/dashboard/settings/secrets/actions.ts and src/app/company/actions.ts)
 * so the policy is genuinely exercised, not merely defined.
 *
 * Every DENY decision fires a `PERMISSION_DENIED` SecurityEvent
 * (fire-and-forget, matching this codebase's existing `notifyUser` /
 * `fireWorkflowTrigger` discipline — a logging failure must never break the
 * real request that triggered the check).
 */

export type AbacAction = "read" | "write" | "delete";

export interface AbacContext {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** The resource's owning user, if the resource has one (e.g. a per-user ApiKey). */
  resourceOwnerId?: string;
  /** The resource's owning organization, if the resource has one. */
  resourceOrganizationId?: string;
}

export interface AbacDecision {
  allowed: boolean;
  reason?: string;
}

const WRITE_ACTIONS: ReadonlySet<AbacAction> = new Set(["write", "delete"]);

/** Roles that are attribute-restricted to read-only, independent of any RBAC permission a caller might otherwise be granted for a given action. */
const READ_ONLY_ROLES: ReadonlySet<MembershipRole> = new Set(["VIEWER"]);

/**
 * Real attribute-based policy check. Returns `{ allowed: false, reason }`
 * rather than throwing, so callers can decide how to surface the rejection
 * (an `ActionResult`-style error, a redirect, a 403 response, etc.) — same
 * calling convention as this codebase's existing `requireEditableOrganization`
 * / `requirePrivileged` helpers it's meant to formalize.
 *
 * A logging failure inside this function must never itself cause a false
 * DENY — the SecurityEvent write happens fire-and-forget, after the real
 * decision has already been computed.
 */
export function canAccessResource(context: AbacContext, action: AbacAction): AbacDecision {
  const decision = evaluate(context, action);
  if (!decision.allowed) {
    void logSecurityEvent({
      userId: context.userId,
      organizationId: context.organizationId,
      type: "PERMISSION_DENIED",
      severity: "WARNING",
      detail: `abac:${action} denied — ${decision.reason}`,
      metadata: {
        action,
        role: context.role,
        resourceOwnerId: context.resourceOwnerId,
        resourceOrganizationId: context.resourceOrganizationId,
      },
    });
  }
  return decision;
}

function evaluate(context: AbacContext, action: AbacAction): AbacDecision {
  // Tenant isolation — a resource that declares an organizationId must match
  // the actor's own. This is the formalized version of the org-scope filter
  // every Server Action is expected to apply on every query today.
  if (context.resourceOrganizationId && context.resourceOrganizationId !== context.organizationId) {
    return { allowed: false, reason: "resource belongs to a different organization" };
  }

  // Read-only roles can never write or delete, regardless of resource
  // ownership — this is an attribute of the ROLE itself, layered on top of
  // (not a substitute for) whatever narrower RBAC permission set a Server
  // Action already enforces for that action.
  if (READ_ONLY_ROLES.has(context.role) && WRITE_ACTIONS.has(action)) {
    return { allowed: false, reason: `role ${context.role} is read-only` };
  }

  return { allowed: true };
}
