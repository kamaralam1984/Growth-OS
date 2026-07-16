import type { ReportBlueprint, ReportFormat } from "./report-blueprint";
import { renderReportToPptx } from "./pptx-renderer";
import { renderReportToPdfDeck } from "./board-deck-pdf";
import { renderReportToDocx } from "./docx-adapter";
import { renderReportToJson, renderReportToCsv, renderReportToExcel } from "./tabular-renderers";

/**
 * The single entry point every report-producing feature (BI report tiers,
 * board/CEO/investor reports, proposal/CRM/delivery reports going forward)
 * should call instead of hand-rolling a renderer. One ReportBlueprint in,
 * any of six real formats out — adding a new report TYPE never means
 * writing a new exporter, only a new blueprint-building function.
 */
export async function generateReport(blueprint: ReportBlueprint, format: ReportFormat): Promise<Buffer> {
  switch (format) {
    case "pdf":
      return renderReportToPdfDeck(blueprint);
    case "pptx":
      return renderReportToPptx(blueprint);
    case "docx":
      return renderReportToDocx(blueprint);
    case "json":
      return renderReportToJson(blueprint);
    case "csv":
      return renderReportToCsv(blueprint);
    case "excel":
      return renderReportToExcel(blueprint);
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported report format: ${exhaustive}`);
    }
  }
}

export const REPORT_FORMAT_MIME: Record<ReportFormat, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  json: "application/json",
  csv: "text/csv",
  excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const REPORT_FORMAT_EXTENSION: Record<ReportFormat, string> = {
  pdf: "pdf",
  pptx: "pptx",
  docx: "docx",
  json: "json",
  csv: "csv",
  excel: "xlsx",
};
