"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { runLaunchChecklist } from "@/lib/ops/launch-checklist";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function runLaunchChecklistAction(): Promise<ActionResult & { runId?: string }> {
  const { userId } = await requirePlatformOwner("/admin/launch");

  try {
    const run = await runLaunchChecklist(userId);
    await logAudit({ userId, action: "admin.launch_checklist_run", metadata: { runId: run.id, overallScore: run.overallScore } });
    revalidatePath("/admin/launch");
    return { ok: true, runId: run.id };
  } catch (error) {
    console.error("[admin/launch] runLaunchChecklistAction failed:", error);
    return { ok: false, error: "Something went wrong running the checklist." };
  }
}
