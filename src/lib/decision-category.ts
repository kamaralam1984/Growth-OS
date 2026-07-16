import type { DecisionCategory } from "@/generated/prisma/client";

/** Shared label map — used by the propose-decision form and the War Room Decision Board. */
export const DECISION_CATEGORY_LABEL: Record<DecisionCategory, string> = {
  PROPOSAL_APPROVAL: "Approve/Reject Proposal",
  CLIENT_CONTACT: "Contact Client",
  QUOTE_GENERATION: "Generate Quote",
  MEETING_SCHEDULING: "Schedule Meeting",
  ISSUE_ESCALATION: "Escalate Issue",
  GENERAL: "General",
  QUOTATION_APPROVAL: "Approve/Reject Quotation",
  CONTRACT_APPROVAL: "Approve/Reject Contract",
  INVOICE_APPROVAL: "Approve/Reject Invoice",
  PROJECT_DELIVERY: "Project Delivery Decision",
};

export const DECISION_CATEGORY_OPTIONS: DecisionCategory[] = [
  "GENERAL",
  "PROPOSAL_APPROVAL",
  "CLIENT_CONTACT",
  "QUOTE_GENERATION",
  "MEETING_SCHEDULING",
  "ISSUE_ESCALATION",
  "QUOTATION_APPROVAL",
  "CONTRACT_APPROVAL",
  "INVOICE_APPROVAL",
  "PROJECT_DELIVERY",
];
