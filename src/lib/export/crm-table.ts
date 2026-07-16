import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

/**
 * Generic column-based tabular exporter, shared by the CRM's Deals, Tasks,
 * and Reports exports (Pipeline/Sales/Revenue/Task/Activity/Performance) —
 * one shared implementation instead of six near-identical CSV/Excel/PDF
 * builders. Company/Campaign/Scan exports (src/lib/export/csv.ts,
 * excel.ts, pdf.ts) keep their own bespoke shape since those have
 * profile-specific PDF layouts; this covers plain row-per-record tables.
 */
export interface ExportColumn<T> {
  header: string;
  key: string;
  width?: number;
  value: (row: T) => string | number | null | undefined;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function rowsToCsv<T>(rows: T[], columns: Array<ExportColumn<T>>): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(","));
  return [header, ...lines].join("\n");
}

export async function rowsToExcelBuffer<T>(rows: T[], columns: Array<ExportColumn<T>>, sheetName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KVL GrowthOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const record: Record<string, string | number> = {};
    for (const c of columns) record[c.key] = c.value(row) ?? "";
    sheet.addRow(record);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

export async function rowsToPdfBuffer<T>(
  rows: T[],
  columns: Array<ExportColumn<T>>,
  title: string,
  organizationName: string,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  const bufferPromise = collectPdfBuffer(doc);

  doc.fontSize(18).text(`${organizationName} — ${title}`);
  doc.fontSize(10).fillColor("#666666").text(`Generated ${new Date().toLocaleString()} · ${rows.length} rows`);
  doc.moveDown(1);
  doc.fillColor("#000000");

  for (const row of rows) {
    const line = columns.map((c) => `${c.header}: ${c.value(row) ?? "—"}`).join("   ·   ");
    doc.fontSize(9).text(line);
    doc.moveDown(0.3);
    if (doc.y > doc.page.height - 60) doc.addPage();
  }

  doc.end();
  return bufferPromise;
}
