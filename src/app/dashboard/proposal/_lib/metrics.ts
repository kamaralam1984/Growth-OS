import { prisma } from "@/lib/prisma";

export interface DocumentDashboardMetrics {
  proposalsCreated: number;
  pendingApprovals: number;
  accepted: number;
  rejected: number;
  /** Sum of value/grandTotal across every open (non-terminal) Proposal/Quotation — a real, traceable forecast, never AI-estimated. */
  revenueForecast: number;
  invoicesCount: number;
  invoicesOutstanding: number;
  invoicesOverdueCount: number;
  contractsCount: number;
  contractsSignedCount: number;
}

const PROPOSAL_TERMINAL = new Set(["ACCEPTED", "REJECTED"]);
const QUOTATION_TERMINAL = new Set(["ACCEPTED", "REJECTED", "EXPIRED"]);

/** Real Documents Dashboard numbers — every figure traces to a live query across Proposal/Quotation/Contract/Invoice/Task(APPROVAL), same "no fabrication" discipline as the CRM Dashboard's metrics.ts. */
export async function getDocumentDashboardMetrics(organizationId: string): Promise<DocumentDashboardMetrics> {
  const [proposals, quotations, pendingApprovals, invoices, contractsCount, contractsSignedCount] = await Promise.all([
    prisma.proposal.findMany({ where: { organizationId }, select: { status: true, value: true } }),
    prisma.quotation.findMany({ where: { organizationId }, select: { status: true, grandTotal: true } }),
    prisma.task.count({ where: { organizationId, type: "APPROVAL", status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    prisma.invoice.findMany({ where: { organizationId }, select: { status: true, grandTotal: true, amountPaid: true } }),
    prisma.contract.count({ where: { organizationId } }),
    prisma.contract.count({ where: { organizationId, status: "SIGNED" } }),
  ]);

  const accepted = proposals.filter((p) => p.status === "ACCEPTED").length + quotations.filter((q) => q.status === "ACCEPTED").length;
  const rejected = proposals.filter((p) => p.status === "REJECTED").length + quotations.filter((q) => q.status === "REJECTED").length;

  const openProposalValue = proposals.filter((p) => !PROPOSAL_TERMINAL.has(p.status)).reduce((sum, p) => sum + (p.value ?? 0), 0);
  const openQuotationValue = quotations.filter((q) => !QUOTATION_TERMINAL.has(q.status)).reduce((sum, q) => sum + q.grandTotal, 0);

  const invoicesOutstanding = invoices.reduce((sum, inv) => sum + Math.max(inv.grandTotal - inv.amountPaid, 0), 0);
  const invoicesOverdueCount = invoices.filter((inv) => inv.status === "OVERDUE").length;

  return {
    proposalsCreated: proposals.length,
    pendingApprovals,
    accepted,
    rejected,
    revenueForecast: openProposalValue + openQuotationValue,
    invoicesCount: invoices.length,
    invoicesOutstanding,
    invoicesOverdueCount,
    contractsCount,
    contractsSignedCount,
  };
}
