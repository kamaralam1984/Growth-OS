"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createEmergencyContact, deactivateEmergencyContact } from "@/lib/ops/emergency-contacts";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(200),
  role: z.string().trim().min(1, "Enter a role.").max(120),
  email: z.string().trim().email("Enter a valid email."),
  phone: z.string().trim().max(40).optional(),
  escalationOrder: z.coerce.number().int().min(1).max(99),
});

export async function createEmergencyContactAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/production");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the contact fields." };
  }

  try {
    const contact = await createEmergencyContact(parsed.data);
    await logAudit({ userId, action: "admin.emergency_contact_created", metadata: { contactId: contact.id } });
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (error) {
    console.error("[admin/production] createEmergencyContactAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const deactivateSchema = z.object({ contactId: z.string().trim().min(1) });

export async function deactivateEmergencyContactAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/production");

  const parsed = deactivateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Missing contact." };

  try {
    await deactivateEmergencyContact(parsed.data.contactId);
    await logAudit({ userId, action: "admin.emergency_contact_deactivated", metadata: { contactId: parsed.data.contactId } });
    revalidatePath("/admin/production");
    return { ok: true };
  } catch (error) {
    console.error("[admin/production] deactivateEmergencyContactAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
