import Link from "next/link";
import { Globe, Search, AlertCircle } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { getScanStats } from "@/lib/scanner/scan-analytics";
import { ScanForm } from "./_components/scan-form";
import { ScanStatsStrip } from "./_components/scan-stats-strip";
import { OpportunityBandBadge } from "./_components/opportunity-band-badge";
import { ScanExportMenu } from "./_components/scan-export-menu";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  PENDING: "outline",
  SCANNING: "accent",
  COMPLETED: "default",
  FAILED: "secondary",
};

export default async function WebsiteScannerPage() {
  const { membership } = await requireActiveMembership("/dashboard/website-scanner");

  const [stats, scans] = await Promise.all([
    getScanStats(membership.organizationId),
    prisma.websiteScan.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
      take: 24,
      include: { opportunity: { select: { overallOpportunityScore: true, band: true } } },
    }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
              <Globe className="size-6 text-primary" /> Website Scanner
            </h1>
            <p className="text-sm text-muted-foreground">
              Scan any company website — real HTTP fetch and HTML analysis, plus one real AI reasoning pass — for a
              premium Executive Opportunity Report. No fabricated findings, ever.
            </p>
          </div>
          {scans.length > 0 && <ScanExportMenu />}
        </div>

        <ScanStatsStrip stats={stats} />

        <ScanForm />

        {scans.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Search className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No scans yet. Scan a website above to generate your first Executive Opportunity Report.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scans.map((scan) => (
              <Link key={scan.id} href={`/dashboard/website-scanner/${scan.id}`}>
                <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          {scan.status === "FAILED" ? <AlertCircle className="size-4" /> : <Globe className="size-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{scan.websiteName || scan.companyNameInput || scan.url}</p>
                          <p className="truncate text-xs text-muted-foreground">{scan.finalUrl || scan.url}</p>
                        </div>
                      </div>
                      <Badge variant={STATUS_VARIANT[scan.status]}>{scan.status}</Badge>
                    </div>
                    {scan.opportunity && <OpportunityBandBadge band={scan.opportunity.band} score={scan.opportunity.overallOpportunityScore} />}
                    {scan.status === "FAILED" && scan.errorMessage && <p className="text-xs text-destructive">{scan.errorMessage}</p>}
                    <p className="text-xs text-muted-foreground">{new Date(scan.createdAt).toLocaleString()}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
