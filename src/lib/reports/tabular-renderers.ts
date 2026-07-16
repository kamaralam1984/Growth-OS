import ExcelJS from "exceljs";

import type { ReportBlueprint } from "@/lib/reports/report-blueprint";

/** JSON export — the blueprint verbatim, pretty-printed; Date fields serialize via their own toJSON. */
export function renderReportToJson(blueprint: ReportBlueprint): Buffer {
  return Buffer.from(JSON.stringify(blueprint, null, 2), "utf8");
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvEscape).join(",");
}

/**
 * CSV export — flattens every section's table into one file, each table
 * preceded by a sub-header row naming its section. Falls back to a plain
 * heading/body listing when no section carries a table, so the export is
 * never empty.
 */
export function renderReportToCsv(blueprint: ReportBlueprint): Buffer {
  const sectionsWithTables = blueprint.sections.filter((section) => section.table);

  if (sectionsWithTables.length === 0) {
    const lines = [
      csvRow(["Heading", "Body"]),
      ...blueprint.sections.map((section) => csvRow([section.heading, section.body ?? ""])),
    ];
    return Buffer.from(lines.join("\r\n"), "utf8");
  }

  const blocks: string[] = [];
  for (const section of sectionsWithTables) {
    const table = section.table!;
    const lines = [csvRow([`=== ${section.heading} ===`]), csvRow(table.headers), ...table.rows.map((row) => csvRow(row))];
    blocks.push(lines.join("\r\n"));
  }
  return Buffer.from(blocks.join("\r\n\r\n"), "utf8");
}

function sanitizeSheetName(heading: string, usedNames: Set<string>): string {
  let name = heading.replace(/[/\\?*[\]:]/g, " ").trim();
  if (!name) name = "Sheet";
  name = name.slice(0, 31);

  let candidate = name;
  let suffix = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    candidate = `${name.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Excel export — one worksheet per section that has a table, header row
 * bold, right-aligned columns per table.alignRightColumns. Falls back to a
 * single "Report" worksheet of heading/body pairs when no section has a
 * table. The first worksheet gets a title row for blueprint.title (and
 * generatedAt, if present).
 */
export async function renderReportToExcel(blueprint: ReportBlueprint): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = blueprint.brand.organizationName || "KVL GrowthOS";
  workbook.created = blueprint.generatedAt ?? new Date();

  const sectionsWithTables = blueprint.sections.filter((section) => section.table);
  const usedNames = new Set<string>();

  function addTitleRow(sheet: ExcelJS.Worksheet) {
    const titleRow = sheet.addRow([blueprint.title]);
    titleRow.font = { bold: true, size: 14 };
    if (blueprint.generatedAt) {
      const generatedRow = sheet.addRow([`Generated: ${blueprint.generatedAt.toISOString()}`]);
      generatedRow.font = { italic: true };
    }
    sheet.addRow([]);
  }

  if (sectionsWithTables.length === 0) {
    const sheet = workbook.addWorksheet("Report");
    addTitleRow(sheet);
    const headerRow = sheet.addRow(["Heading", "Body"]);
    headerRow.font = { bold: true };
    for (const section of blueprint.sections) {
      sheet.addRow([section.heading, section.body ?? ""]);
    }
    sheet.columns.forEach((column) => {
      column.width = 40;
    });
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  sectionsWithTables.forEach((section, index) => {
    const table = section.table!;
    const sheet = workbook.addWorksheet(sanitizeSheetName(section.heading, usedNames));

    if (index === 0) addTitleRow(sheet);

    const headerRow = sheet.addRow(table.headers);
    headerRow.font = { bold: true };

    for (const row of table.rows) {
      sheet.addRow(row);
    }

    if (table.alignRightColumns?.length) {
      for (const columnIndex of table.alignRightColumns) {
        sheet.getColumn(columnIndex + 1).alignment = { horizontal: "right" };
      }
    }

    sheet.columns.forEach((column) => {
      column.width = 20;
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
