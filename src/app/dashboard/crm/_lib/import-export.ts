"use server";

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { contactSchema } from "@/lib/validations/outreach";
import { companySchema } from "@/lib/validations/company-directory";

export interface ImportResult {
  ok: boolean;
  error?: string;
  imported?: number;
  skipped?: number;
  errors?: string[];
}

const MAX_IMPORT_ROWS = 1000;

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

/**
 * Reads a CSV or .xlsx File into plain header->value row objects, via
 * exceljs (already a dependency for Excel export elsewhere in the app —
 * both formats share this one code path since exceljs reads both).
 */
async function parseRows(file: File): Promise<Record<string, string>[]> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";

  let worksheet: ExcelJS.Worksheet | undefined;
  if (isCsv) {
    worksheet = await workbook.csv.read(Readable.from(buffer));
  } else {
    // exceljs ships its own (older) @types/node-shaped Buffer type, which
    // TypeScript treats as a distinct nominal type from this project's
    // Buffer — same real Buffer instance at runtime either way.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
    worksheet = workbook.worksheets[0];
  }
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim().toLowerCase();
  });

  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (header) record[header] = cell.value != null ? String(cell.value).trim() : "";
    });
    if (Object.values(record).some((v) => v !== "")) rows.push(record);
  });

  return rows;
}

function firstNonEmpty(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    if (row[key]) return row[key];
  }
  return "";
}

/**
 * Bulk Contact import from CSV/Excel — Google Contacts OAuth import is out
 * of scope (needs real Google Cloud OAuth credentials this environment
 * doesn't have); this covers the two formats that need no external
 * service. Rows with an email that already exists in the org are skipped,
 * not overwritten — importing is additive, never destructive.
 */
export async function importContactsFile(formData: FormData): Promise<ImportResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV or Excel file to import." };

  let rows: Record<string, string>[];
  try {
    rows = await parseRows(file);
  } catch (error) {
    console.error("[crm] importContactsFile parse failed:", error);
    return { ok: false, error: "Couldn't read that file — make sure it's a valid CSV or .xlsx export." };
  }
  if (rows.length === 0) return { ok: false, error: "That file has no data rows." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `Import is limited to ${MAX_IMPORT_ROWS} rows at a time.` };

  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = contactSchema.safeParse({
      firstName: firstNonEmpty(row, ["first name", "firstname", "name"]),
      lastName: firstNonEmpty(row, ["last name", "lastname"]),
      email: firstNonEmpty(row, ["email", "business email", "e-mail"]),
      jobTitle: firstNonEmpty(row, ["job title", "position", "title"]),
      phone: firstNonEmpty(row, ["phone", "business phone", "mobile"]),
      country: firstNonEmpty(row, ["country"]),
      city: firstNonEmpty(row, ["city"]),
      tags: [],
      status: "NEW",
    });
    if (!parsed.success) {
      errors.push(`Row ${index + 2}: ${parsed.error.issues[0]?.message ?? "invalid row"}`);
      continue;
    }

    try {
      const existing = await prisma.contact.findFirst({
        where: { organizationId: membership.organizationId, email: parsed.data.email },
        select: { id: true },
      });
      if (existing) {
        errors.push(`Row ${index + 2}: ${parsed.data.email} already exists — skipped.`);
        continue;
      }

      await prisma.contact.create({
        data: {
          organizationId: membership.organizationId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName || null,
          email: parsed.data.email,
          jobTitle: parsed.data.jobTitle || null,
          phone: parsed.data.phone || null,
          country: parsed.data.country || null,
          city: parsed.data.city || null,
          tags: [],
          status: "NEW",
        },
      });
      imported++;
    } catch (error) {
      console.error("[crm] importContactsFile row failed:", error);
      errors.push(`Row ${index + 2}: something went wrong saving this row.`);
    }
  }

  await logAudit({
    userId,
    organizationId: membership.organizationId,
    action: "crm.contacts_imported",
    metadata: { imported, skipped: rows.length - imported },
  });
  revalidatePath("/dashboard/crm/contacts");
  revalidatePath("/dashboard/outreach/contacts");
  return { ok: true, imported, skipped: rows.length - imported, errors: errors.slice(0, 20) };
}

/**
 * Bulk Company import. Deliberately skips the live geocoding that the
 * single-company createCompany() action does (see
 * src/app/dashboard/companies/actions.ts) — geocoding up to 1000 rows
 * against Nominatim's ~1 req/sec rate limit would make an import take
 * minutes; a company's location can still be geocoded afterward the normal
 * way by editing it. Rows matching an existing company name are skipped.
 */
export async function importCompaniesFile(formData: FormData): Promise<ImportResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV or Excel file to import." };

  let rows: Record<string, string>[];
  try {
    rows = await parseRows(file);
  } catch (error) {
    console.error("[crm] importCompaniesFile parse failed:", error);
    return { ok: false, error: "Couldn't read that file — make sure it's a valid CSV or .xlsx export." };
  }
  if (rows.length === 0) return { ok: false, error: "That file has no data rows." };
  if (rows.length > MAX_IMPORT_ROWS) return { ok: false, error: `Import is limited to ${MAX_IMPORT_ROWS} rows at a time.` };

  let imported = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const parsed = companySchema.safeParse({
      name: firstNonEmpty(row, ["name", "company", "company name"]),
      industry: firstNonEmpty(row, ["industry"]),
      website: firstNonEmpty(row, ["website", "url"]),
      email: firstNonEmpty(row, ["email"]),
      phone: firstNonEmpty(row, ["phone"]),
      address: firstNonEmpty(row, ["address"]),
      notes: firstNonEmpty(row, ["notes"]),
    });
    if (!parsed.success) {
      errors.push(`Row ${index + 2}: ${parsed.error.issues[0]?.message ?? "invalid row"}`);
      continue;
    }

    try {
      const existing = await prisma.company.findFirst({
        where: { organizationId: membership.organizationId, name: parsed.data.name },
        select: { id: true },
      });
      if (existing) {
        errors.push(`Row ${index + 2}: "${parsed.data.name}" already exists — skipped.`);
        continue;
      }

      await prisma.company.create({
        data: {
          organizationId: membership.organizationId,
          name: parsed.data.name,
          industry: parsed.data.industry || null,
          website: parsed.data.website || null,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          address: parsed.data.address || null,
          notes: parsed.data.notes || null,
          source: "MANUAL",
        },
      });
      imported++;
    } catch (error) {
      console.error("[crm] importCompaniesFile row failed:", error);
      errors.push(`Row ${index + 2}: something went wrong saving this row.`);
    }
  }

  await logAudit({
    userId,
    organizationId: membership.organizationId,
    action: "crm.companies_imported",
    metadata: { imported, skipped: rows.length - imported },
  });
  revalidatePath("/dashboard/companies");
  revalidatePath("/dashboard/crm/contacts");
  return { ok: true, imported, skipped: rows.length - imported, errors: errors.slice(0, 20) };
}
