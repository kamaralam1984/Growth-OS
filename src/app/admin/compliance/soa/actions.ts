"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createSoAEntry, updateSoAEntry } from "@/lib/security/statement-of-applicability";
import type { SoATheme, SoAImplementationStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const THEMES = new Set<SoATheme>(["ORGANIZATIONAL", "PEOPLE", "PHYSICAL", "TECHNOLOGICAL"]);
const IMPLEMENTATION_STATUSES = new Set<SoAImplementationStatus>(["NOT_IMPLEMENTED", "PARTIALLY_IMPLEMENTED", "IMPLEMENTED", "NOT_APPLICABLE"]);

const createSchema = z.object({
  controlId: z.string().trim().min(1, "Enter the Annex A control id (e.g. A.5.1).").max(30),
  controlTitle: z.string().trim().min(1, "Enter the control title.").max(300),
  theme: z.string(),
  applicable: z.boolean(),
  justification: z.string().trim().min(1, "Explain why this control is/isn't applicable.").max(3000),
  implementationStatus: z.string(),
});

export async function createSoAEntryAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/soa");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the SoA fields." };
  }
  if (!THEMES.has(parsed.data.theme as SoATheme) || !IMPLEMENTATION_STATUSES.has(parsed.data.implementationStatus as SoAImplementationStatus)) {
    return { ok: false, error: "Choose a valid theme/implementation status." };
  }

  try {
    const entry = await createSoAEntry({
      controlId: parsed.data.controlId,
      controlTitle: parsed.data.controlTitle,
      theme: parsed.data.theme as SoATheme,
      applicable: parsed.data.applicable,
      justification: parsed.data.justification,
      implementationStatus: parsed.data.implementationStatus as SoAImplementationStatus,
    });
    await logAudit({ userId, action: "admin.soa_entry_created", metadata: { entryId: entry.id, controlId: entry.controlId } });
    revalidatePath("/admin/compliance/soa");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/soa] createSoAEntryAction failed:", error);
    return { ok: false, error: error instanceof Error && error.message.includes("Unique constraint") ? "That control id already has an entry." : "Something went wrong. Please try again." };
  }
}

const updateStatusSchema = z.object({
  entryId: z.string().trim().min(1),
  implementationStatus: z.string(),
});

export async function updateSoAImplementationStatusAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/soa");

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }
  if (!IMPLEMENTATION_STATUSES.has(parsed.data.implementationStatus as SoAImplementationStatus)) {
    return { ok: false, error: "Choose a valid implementation status." };
  }

  try {
    await updateSoAEntry(parsed.data.entryId, {
      implementationStatus: parsed.data.implementationStatus as SoAImplementationStatus,
      reviewedByUserId: userId,
    });
    await logAudit({ userId, action: "admin.soa_entry_updated", metadata: { entryId: parsed.data.entryId, implementationStatus: parsed.data.implementationStatus } });
    revalidatePath("/admin/compliance/soa");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/soa] updateSoAImplementationStatusAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
