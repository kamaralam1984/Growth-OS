import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { withApiKeyAuth } from "@/lib/auth/with-api-key-auth";
import { rowsToCsv, rowsToExcelBuffer, rowsToPdfBuffer, type ExportColumn } from "@/lib/export/crm-table";

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");

interface ContactExportRow {
  fullName: string;
  email: string;
  jobTitle: string;
  phone: string;
  company: string;
  status: string;
  owner: string;
  createdAt: string;
}

const COLUMNS: Array<ExportColumn<ContactExportRow>> = [
  { header: "Name", key: "fullName", width: 24, value: (r) => r.fullName },
  { header: "Email", key: "email", width: 28, value: (r) => r.email },
  { header: "Job Title", key: "jobTitle", width: 20, value: (r) => r.jobTitle },
  { header: "Phone", key: "phone", width: 16, value: (r) => r.phone },
  { header: "Company", key: "company", width: 24, value: (r) => r.company },
  { header: "Status", key: "status", width: 12, value: (r) => r.status },
  { header: "Owner", key: "owner", width: 20, value: (r) => r.owner },
  { header: "Created At", key: "createdAt", width: 16, value: (r) => r.createdAt },
];

/** Auth-gated bulk Contact export — CSV / Excel / PDF, all real org data. Session cookie or `Authorization: Bearer <key>` with the `export:contacts:read` scope, mirroring the Company/Deal export shape. */
async function exportContacts(request: Request, organizationId: string, organizationName: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const contacts = await prisma.contact.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { company: { select: { name: true } }, owner: { select: { name: true, email: true } } },
  });

  const rows: ContactExportRow[] = contacts.map((c) => ({
    fullName: [c.firstName, c.lastName].filter(Boolean).join(" "),
    email: c.email,
    jobTitle: c.jobTitle ?? "",
    phone: c.phone ?? "",
    company: c.company?.name ?? "",
    status: c.status,
    owner: c.owner?.name ?? c.owner?.email ?? "",
    createdAt: c.createdAt.toISOString().slice(0, 10),
  }));

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await rowsToExcelBuffer(rows, COLUMNS, "Contacts");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="contacts-${dateStamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await rowsToPdfBuffer(rows, COLUMNS, "Contacts", organizationName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contacts-${dateStamp}.pdf"`,
      },
    });
  }

  const csv = rowsToCsv(rows, COLUMNS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${dateStamp}.csv"`,
    },
  });
}

const getWithApiKey = withApiKeyAuth("export:contacts:read", async (request, apiKeyAuth) => {
  const organization = await prisma.organization.findUnique({
    where: { id: apiKeyAuth.organizationId },
    select: { name: true },
  });
  return exportContacts(request, apiKeyAuth.organizationId, organization?.name ?? "");
});

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const membership = await resolveActiveMembership(userId);
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return exportContacts(request, membership.organizationId, membership.organization.name);
  }

  return getWithApiKey(request);
}
