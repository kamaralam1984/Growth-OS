import type { DocumentBlueprint } from "@/lib/documents";

export interface BusinessDocumentBlueprintInput {
  kind: string;
  title: string;
  content: string;
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  counterpartyName?: string | null;
  companyName?: string | null;
  needsSignature: boolean;
  createdAt: Date;
}

/** Document kinds that are agreements/acknowledgements — these get a signature block by default; the rest (SOW, Roadmap, Risk Register, etc.) are informational documents. */
export const SIGNATURE_KINDS = new Set(["NDA", "MSA", "SLA", "ACCEPTANCE_LETTER", "DELIVERY_CERTIFICATE"]);

const KIND_LABEL: Record<string, string> = {
  NDA: "Non-Disclosure Agreement",
  MSA: "Master Service Agreement",
  SLA: "Service Level Agreement",
  TERMS: "Terms & Conditions",
  PRIVACY_AGREEMENT: "Privacy Agreement",
  ACCEPTANCE_LETTER: "Acceptance Letter",
  DELIVERY_CERTIFICATE: "Delivery Certificate",
  SCOPE_OF_WORK: "Scope of Work",
  REQUIREMENT_SPECIFICATION: "Requirement Specification",
  TECHNICAL_ARCHITECTURE: "Technical Architecture",
  PROJECT_ROADMAP: "Project Roadmap",
  RISK_REGISTER: "Risk Register",
  ACCEPTANCE_CRITERIA: "Acceptance Criteria",
  PROJECT_PLAN: "Project Plan",
  BUSINESS_REPORT: "Business Report",
};

export function buildBusinessDocumentBlueprint(input: BusinessDocumentBlueprintInput): DocumentBlueprint {
  return {
    docKind: "BUSINESS_DOCUMENT",
    title: input.title,
    subtitle: KIND_LABEL[input.kind] ?? input.kind,
    brand: { organizationName: input.organizationName, logoUrl: input.logoUrl, gstNumber: input.gstNumber, registrationNumber: input.registrationNumber },
    preparedFor: input.counterpartyName || input.companyName ? { name: input.counterpartyName ?? input.companyName ?? "Recipient" } : undefined,
    tableOfContents: false,
    sections: [{ heading: KIND_LABEL[input.kind] ?? input.kind, body: input.content }],
    signatureBlock: input.needsSignature ? { parties: [{ role: input.counterpartyName ?? "Recipient" }, { role: input.organizationName }] } : undefined,
    footerText: input.organizationName,
    generatedAt: input.createdAt,
  };
}
