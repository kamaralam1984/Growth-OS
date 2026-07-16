"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { setSecret, deleteSecret } from "@/lib/secrets/store";
import { createOrRotateSecretSchema } from "@/lib/validations/secrets";
import { canAccessResource } from "@/lib/security/abac";
import type { MembershipRole } from "@/generated/prisma/client";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function requirePrivileged(): Promise<
  ActionResult & { organizationId?: string; userId?: string; role?: MembershipRole }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can manage secrets." };

  // Real ABAC layer, on top of the RBAC role gate above: secrets are among
  // this app's most security-sensitive resources (SECRETS_MANAGER_ENCRYPTION_KEY-
  // encrypted at rest), so this is one of the small number of concrete call
  // sites where the new attribute-based policy layer is actually exercised
  // (src/lib/security/abac.ts) rather than merely defined.
  const decision = canAccessResource(
    { userId, organizationId: membership.organizationId, role: membership.role },
    "write",
  );
  if (!decision.allowed) return { ok: false, error: "You do not have permission to manage secrets." };

  return { ok: true, organizationId: membership.organizationId, userId, role: membership.role };
}

/**
 * Creates a new secret, or rotates (overwrites) an existing one with the
 * same key. This is the ONLY write path from the UI — there is no
 * corresponding read action. A secret's value goes in here and is never
 * returned; the audit log records which key changed and who changed it,
 * never the value itself.
 */
export async function createOrRotateSecret(input: unknown): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  const parsed = createOrRotateSecretSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }

  const { key, value, category, description } = parsed.data;

  const existing = await prisma.secret.findUnique({
    where: { organizationId_key: { organizationId: access.organizationId, key } },
    select: { id: true },
  });

  try {
    await setSecret(access.organizationId, key, value, category, description, access.userId);
  } catch (error) {
    console.error("[secrets] createOrRotateSecret failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: existing ? "secret.rotated" : "secret.created",
    metadata: { key, category },
  });

  revalidatePath("/dashboard/settings/secrets");
  return { ok: true };
}

export async function deleteSecretAction(id: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId || !access.role) return access;

  // Looked up by bare id (NOT by a composite (organizationId, id) key) on
  // purpose, so the ABAC tenant-isolation check below is doing real work
  // rather than rubber-stamping a query that already filtered by org.
  const secret = await prisma.secret.findUnique({
    where: { id },
    select: { key: true, organizationId: true },
  });
  if (!secret) return { ok: false, error: "Secret not found." };

  const decision = canAccessResource(
    {
      userId: access.userId,
      organizationId: access.organizationId,
      role: access.role,
      resourceOrganizationId: secret.organizationId,
    },
    "delete",
  );
  if (!decision.allowed) return { ok: false, error: "Secret not found." };

  await deleteSecret(access.organizationId, id);
  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: "secret.deleted",
    metadata: { key: secret.key },
  });

  revalidatePath("/dashboard/settings/secrets");
  return { ok: true };
}
