import { prisma } from "@/lib/prisma";
import type { StatementOfApplicabilityEntry, SoATheme, SoAImplementationStatus } from "@/generated/prisma/client";

/**
 * ISO27001 Statement of Applicability — for each Annex A control the
 * organization decides to scope in/out, a real admin records the control
 * id/title THEY enter (this app never pre-seeds or fabricates official
 * ISO 27001:2022 Annex A control text — ISO's exact control wording is
 * copyrighted standard text, and no code here can substitute for reading
 * the actual standard), the applicability decision, a justification, and
 * an implementation status.
 */

export interface CreateSoAEntryInput {
  controlId: string;
  controlTitle: string;
  theme: SoATheme;
  applicable?: boolean;
  justification: string;
  implementationStatus?: SoAImplementationStatus;
  evidenceReference?: string;
}

export async function createSoAEntry(input: CreateSoAEntryInput): Promise<StatementOfApplicabilityEntry> {
  return prisma.statementOfApplicabilityEntry.create({
    data: {
      controlId: input.controlId,
      controlTitle: input.controlTitle,
      theme: input.theme,
      applicable: input.applicable ?? true,
      justification: input.justification,
      implementationStatus: input.implementationStatus || "NOT_IMPLEMENTED",
      evidenceReference: input.evidenceReference || null,
    },
  });
}

export interface UpdateSoAEntryInput {
  controlTitle?: string;
  theme?: SoATheme;
  applicable?: boolean;
  justification?: string;
  implementationStatus?: SoAImplementationStatus;
  evidenceReference?: string | null;
  reviewedByUserId?: string;
}

export async function updateSoAEntry(id: string, input: UpdateSoAEntryInput): Promise<StatementOfApplicabilityEntry> {
  return prisma.statementOfApplicabilityEntry.update({
    where: { id },
    data: {
      controlTitle: input.controlTitle,
      theme: input.theme,
      applicable: input.applicable,
      justification: input.justification,
      implementationStatus: input.implementationStatus,
      evidenceReference: input.evidenceReference,
      reviewedByUserId: input.reviewedByUserId,
      reviewedAt: input.reviewedByUserId ? new Date() : undefined,
    },
  });
}

export async function listSoAEntries(): Promise<StatementOfApplicabilityEntry[]> {
  return prisma.statementOfApplicabilityEntry.findMany({ orderBy: [{ theme: "asc" }, { controlId: "asc" }] });
}

export interface SoASummary {
  total: number;
  applicable: number;
  implemented: number;
  notImplemented: number;
}

export async function getSoASummary(): Promise<SoASummary> {
  const entries = await prisma.statementOfApplicabilityEntry.findMany({
    select: { applicable: true, implementationStatus: true },
  });
  let applicable = 0;
  let implemented = 0;
  let notImplemented = 0;
  for (const e of entries) {
    if (e.applicable) applicable++;
    if (e.implementationStatus === "IMPLEMENTED") implemented++;
    if (e.applicable && e.implementationStatus === "NOT_IMPLEMENTED") notImplemented++;
  }
  return { total: entries.length, applicable, implemented, notImplemented };
}
