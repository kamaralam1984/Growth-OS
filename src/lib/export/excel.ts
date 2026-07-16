import ExcelJS from "exceljs";

import type { ExportCompanyRow } from "./csv";

/** Real .xlsx export of the same fields as companiesToCsv, styled with a header row. */
export async function companiesToExcelBuffer(companies: ExportCompanyRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KVL GrowthOS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Companies");
  sheet.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Industry", key: "industry", width: 18 },
    { header: "Website", key: "website", width: 24 },
    { header: "Email", key: "email", width: 24 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Address", key: "address", width: 28 },
    { header: "City", key: "city", width: 16 },
    { header: "State", key: "state", width: 14 },
    { header: "Country", key: "country", width: 16 },
    { header: "Employees", key: "employees", width: 12 },
    { header: "Estimated Revenue", key: "revenue", width: 18 },
    { header: "Founded Year", key: "founded", width: 12 },
    { header: "Status", key: "status", width: 12 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Source", key: "source", width: 14 },
    { header: "Lead Score Band", key: "band", width: 14 },
    { header: "Lead Score", key: "score", width: 12 },
    { header: "Technologies", key: "tech", width: 32 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const c of companies) {
    sheet.addRow({
      name: c.name,
      industry: c.industry ?? "",
      website: c.website ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.headquartersCity ?? "",
      state: c.headquartersState ?? "",
      country: c.headquartersCountry ?? "",
      employees: c.employeeCount ?? "",
      revenue: c.estimatedRevenue ?? "",
      founded: c.foundedYear ?? "",
      status: c.status,
      priority: c.priority,
      source: c.source,
      band: c.leadScoreBand ?? "",
      score: c.leadScoreOverall ?? "",
      tech: c.technologies.join("; "),
      createdAt: c.createdAt.toISOString().slice(0, 10),
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
