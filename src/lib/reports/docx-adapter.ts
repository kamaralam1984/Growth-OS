import type { DocumentBlueprint } from "@/lib/documents/blueprint";
import { renderDocumentToDocx } from "@/lib/documents/docx-renderer";
import type { ReportBlueprint } from "@/lib/reports/report-blueprint";

export async function renderReportToDocx(blueprint: ReportBlueprint): Promise<Buffer> {
  const documentBlueprint: DocumentBlueprint = {
    // Safe generic pass-through: docKind is carried on DocumentBlueprint but never
    // branched on inside the renderer's rendering logic, so any fixed value works.
    docKind: "BUSINESS_DOCUMENT",
    title: blueprint.title,
    subtitle: blueprint.subtitle,
    brand: blueprint.brand,
    sections: blueprint.sections,
    footerText: blueprint.footerText,
    generatedAt: blueprint.generatedAt,
  };

  return renderDocumentToDocx(documentBlueprint);
}
