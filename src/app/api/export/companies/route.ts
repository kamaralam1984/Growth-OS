import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { withApiKeyAuth } from "@/lib/auth/with-api-key-auth";
import { companiesToCsv, companiesToCrmCsv, type ExportCompanyRow } from "@/lib/export/csv";
import { companiesToExcelBuffer } from "@/lib/export/excel";
import { companiesToPdfBuffer } from "@/lib/export/pdf";

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "crm", "excel", "pdf"]).catch("csv");

/**
 * Auth-gated bulk company export — CSV / CRM-mapped CSV / Excel / PDF, all
 * real org data. Also this app's first real consumer of a bearer `ApiKey`:
 * a signed-in browser session works exactly as before, and a programmatic
 * caller can instead send `Authorization: Bearer <key>` with the
 * `export:companies:read` scope, gated by withApiKeyAuth.
 */
async function exportCompanies(
  request: Request,
  organizationId: string,
  organizationName: string,
): Promise<NextResponse> {
  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const companies = await prisma.company.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { leadScore: { select: { band: true, overallScore: true } } },
  });

  const rows: ExportCompanyRow[] = companies.map((c) => ({
    name: c.name,
    industry: c.industry,
    website: c.website,
    email: c.email,
    phone: c.phone,
    address: c.address,
    headquartersCity: c.headquartersCity,
    headquartersState: c.headquartersState,
    headquartersCountry: c.headquartersCountry,
    employeeCount: c.employeeCount,
    estimatedRevenue: c.estimatedRevenue,
    foundedYear: c.foundedYear,
    status: c.status,
    priority: c.priority,
    source: c.source,
    leadScoreBand: c.leadScore?.band ?? null,
    leadScoreOverall: c.leadScore?.overallScore ?? null,
    technologies: c.technologies,
    createdAt: c.createdAt,
  }));

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await companiesToExcelBuffer(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="companies-${dateStamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await companiesToPdfBuffer(rows, organizationName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="companies-${dateStamp}.pdf"`,
      },
    });
  }

  const csv = format === "crm" ? companiesToCrmCsv(rows) : companiesToCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="companies${format === "crm" ? "-crm" : ""}-${dateStamp}.csv"`,
    },
  });
}

const getWithApiKey = withApiKeyAuth("export:companies:read", async (request, apiKeyAuth) => {
  const organization = await prisma.organization.findUnique({
    where: { id: apiKeyAuth.organizationId },
    select: { name: true },
  });
  return exportCompanies(request, apiKeyAuth.organizationId, organization?.name ?? "");
});

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const membership = await resolveActiveMembership(userId);
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return exportCompanies(request, membership.organizationId, membership.organization.name);
  }

  return getWithApiKey(request);
}
