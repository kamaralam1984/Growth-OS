"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { generateComplianceReport } from "@/lib/security/compliance";
import type { ComplianceFramework } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_FRAMEWORKS = new Set<ComplianceFramework>([
  "SOC2",
  "ISO27001",
  "GDPR",
  "CCPA",
  "DPDP_INDIA",
  "PCI_DSS",
  "WCAG",
]);

const frameworkSchema = z.string();

export async function regenerateComplianceReportAction(framework: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance");

  const parsed = frameworkSchema.safeParse(framework);
  if (!parsed.success || !VALID_FRAMEWORKS.has(parsed.data as ComplianceFramework)) {
    return { ok: false, error: "Choose a valid framework." };
  }

  try {
    const report = await generateComplianceReport(parsed.data as ComplianceFramework);
    await logAudit({
      userId,
      action: "admin.compliance_report_generated",
      metadata: { framework: report.framework, status: report.status, reportId: report.id },
    });
    revalidatePath("/admin/compliance");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance] regenerateComplianceReportAction failed:", error);
    return { ok: false, error: "Something went wrong generating this report. Please try again." };
  }
}
