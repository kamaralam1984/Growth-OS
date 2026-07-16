import ExcelJS from "exceljs";

export interface ExportCampaignRow {
  name: string;
  type: string;
  status: string;
  approvalMode: string;
  targetIndustry: string | null;
  targetCountry: string | null;
  estimatedSuccessPotential: number | null;
  contactsCount: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  meetingsBooked: number;
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

/** Real-data-only CSV export of the org's campaign list. */
export function campaignsToCsv(campaigns: ExportCampaignRow[]): string {
  const header = [
    "Name", "Type", "Status", "Approval Mode", "Target Industry", "Target Country",
    "Success Potential", "Contacts", "Emails Sent", "Open Rate %", "Click Rate %", "Reply Rate %", "Meetings Booked", "Created At",
  ];
  const rows = campaigns.map((c) =>
    toRow([
      c.name, c.type, c.status, c.approvalMode, c.targetIndustry, c.targetCountry,
      c.estimatedSuccessPotential, c.contactsCount, c.emailsSent, c.openRate, c.clickRate, c.replyRate, c.meetingsBooked,
      c.createdAt.toISOString(),
    ]),
  );
  return [toRow(header), ...rows].join("\r\n");
}

/** Real .xlsx export of the org's campaign list, styled with a header row. */
export async function campaignsToExcelBuffer(campaigns: ExportCampaignRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KVL GrowthOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Campaigns");
  sheet.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Type", key: "type", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Approval Mode", key: "approvalMode", width: 16 },
    { header: "Target Industry", key: "targetIndustry", width: 18 },
    { header: "Target Country", key: "targetCountry", width: 16 },
    { header: "Success Potential", key: "potential", width: 16 },
    { header: "Contacts", key: "contacts", width: 12 },
    { header: "Emails Sent", key: "emailsSent", width: 12 },
    { header: "Open Rate %", key: "openRate", width: 12 },
    { header: "Click Rate %", key: "clickRate", width: 12 },
    { header: "Reply Rate %", key: "replyRate", width: 12 },
    { header: "Meetings Booked", key: "meetings", width: 16 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const c of campaigns) {
    sheet.addRow({
      name: c.name,
      type: c.type,
      status: c.status,
      approvalMode: c.approvalMode,
      targetIndustry: c.targetIndustry ?? "",
      targetCountry: c.targetCountry ?? "",
      potential: c.estimatedSuccessPotential ?? "",
      contacts: c.contactsCount,
      emailsSent: c.emailsSent,
      openRate: c.openRate,
      clickRate: c.clickRate,
      replyRate: c.replyRate,
      meetings: c.meetingsBooked,
      createdAt: c.createdAt.toISOString().slice(0, 10),
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
