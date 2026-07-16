/**
 * The canonical shape every document renderer (PDF, DOCX) consumes.
 * Business logic (Proposal/Quotation/Contract/Invoice/BusinessDocument)
 * only ever builds a DocumentBlueprint — it never touches pdfkit or docx
 * directly. This is what makes "export the same document to PDF and
 * DOCX" a guarantee rather than two independently-maintained renderers,
 * and is the shared foundation future phases of KVL GrowthOS build on.
 */

export type DocumentEngineKind = "PROPOSAL" | "QUOTATION" | "CONTRACT" | "INVOICE" | "BUSINESS_DOCUMENT";

export interface DocumentBrand {
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  contactLine?: string | null;
}

export interface DocumentRecipient {
  name: string;
  company?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface DocumentTableData {
  headers: string[];
  rows: Array<Array<string | number>>;
  /** Column indexes that should render right-aligned (typically numeric/currency columns). */
  alignRightColumns?: number[];
}

export interface DocumentChartData {
  labels: string[];
  values: number[];
  valueSuffix?: string;
}

export interface DocumentSection {
  heading: string;
  body?: string;
  bullets?: string[];
  table?: DocumentTableData;
  chart?: DocumentChartData;
}

export interface DocumentSignatureParty {
  role: string;
  name?: string;
}

export interface DocumentBlueprint {
  docKind: DocumentEngineKind;
  title: string;
  subtitle?: string;
  documentNumber?: string;
  brand: DocumentBrand;
  preparedFor?: DocumentRecipient;
  coverNote?: string;
  tableOfContents?: boolean;
  sections: DocumentSection[];
  pricingTable?: DocumentTableData;
  totalsSummary?: Array<{ label: string; value: string; emphasis?: boolean }>;
  signatureBlock?: { parties: DocumentSignatureParty[] };
  watermark?: string;
  footerText?: string;
  generatedAt?: Date;
  /**
   * When true, the first signature-block party's box gets a small literal
   * "/sig1/" anchor string rendered into the PDF's text layer — the target
   * for DocuSign's anchorString-based signHereTabs (see
   * src/lib/documents/signature.ts's createDocuSignEnvelope). Only ever set
   * when a document is actually being routed through DocuSign; every other
   * document renders exactly as before.
   */
  docusignAnchor?: boolean;
}
