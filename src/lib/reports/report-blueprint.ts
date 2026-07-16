import type { DocumentBrand, DocumentSection } from "@/lib/documents/blueprint";

/**
 * The canonical shape every report renderer (PDF deck, PPTX, DOCX, JSON,
 * CSV, Excel) consumes — the Report Export Service's equivalent of
 * src/lib/documents/blueprint.ts's DocumentBlueprint, but for reports
 * (BI/board/investor/CRM/delivery reports) rather than signable business
 * documents. Deliberately reuses DocumentSection/DocumentBrand from the
 * document blueprint rather than declaring parallel types, since a
 * "section with heading/body/bullets/table/chart" is the same real
 * building block in both systems — one slide per section in PPTX, one
 * printed section in PDF/DOCX, one flattened table in CSV/Excel/JSON.
 */
export interface ReportBlueprint {
  title: string;
  subtitle?: string;
  brand: DocumentBrand;
  generatedAt?: Date;
  sections: DocumentSection[];
  footerText?: string;
}

export type ReportFormat = "pdf" | "pptx" | "docx" | "json" | "csv" | "excel";
