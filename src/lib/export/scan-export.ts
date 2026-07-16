import ExcelJS from "exceljs";

export interface ExportScanRow {
  url: string;
  websiteName: string | null;
  companyNameInput: string | null;
  industryInput: string | null;
  status: string;
  overallOpportunityScore: number | null;
  band: string | null;
  estimatedValueMin: number | null;
  estimatedValueMax: number | null;
  scannedAt: Date | null;
  createdAt: Date;
}

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toRow(cells: Array<string | number | null | undefined>): string {
  return cells.map(escapeCsvCell).join(",");
}

/** Real-data-only CSV export of the org's scan list. */
export function scansToCsv(scans: ExportScanRow[]): string {
  const header = ["URL", "Website Name", "Company", "Industry", "Status", "Opportunity Score", "Band", "Est. Value Min", "Est. Value Max", "Scanned At", "Created At"];
  const rows = scans.map((s) =>
    toRow([
      s.url,
      s.websiteName,
      s.companyNameInput,
      s.industryInput,
      s.status,
      s.overallOpportunityScore,
      s.band,
      s.estimatedValueMin,
      s.estimatedValueMax,
      s.scannedAt?.toISOString() ?? "",
      s.createdAt.toISOString(),
    ]),
  );
  return [toRow(header), ...rows].join("\r\n");
}

/** Real .xlsx export of the org's scan list, styled with a header row. */
export async function scansToExcelBuffer(scans: ExportScanRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KVL GrowthOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Website Scans");
  sheet.columns = [
    { header: "URL", key: "url", width: 30 },
    { header: "Website Name", key: "websiteName", width: 24 },
    { header: "Company", key: "company", width: 24 },
    { header: "Industry", key: "industry", width: 18 },
    { header: "Status", key: "status", width: 12 },
    { header: "Opportunity Score", key: "score", width: 16 },
    { header: "Band", key: "band", width: 12 },
    { header: "Est. Value Min", key: "valueMin", width: 16 },
    { header: "Est. Value Max", key: "valueMax", width: 16 },
    { header: "Scanned At", key: "scannedAt", width: 20 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const s of scans) {
    sheet.addRow({
      url: s.url,
      websiteName: s.websiteName ?? "",
      company: s.companyNameInput ?? "",
      industry: s.industryInput ?? "",
      status: s.status,
      score: s.overallOpportunityScore ?? "",
      band: s.band ?? "",
      valueMin: s.estimatedValueMin ?? "",
      valueMax: s.estimatedValueMax ?? "",
      scannedAt: s.scannedAt ? s.scannedAt.toISOString().slice(0, 10) : "",
      createdAt: s.createdAt.toISOString().slice(0, 10),
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
