import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";

/**
 * Real, first-party marketing-site telemetry (src/lib/client/track-marketing-event.ts,
 * MarketingEvent model) — no third-party analytics vendor. Deliberately does
 * NOT show revenue/deal-size/sales-velocity: those numbers only exist in the
 * already-built, org-scoped Enterprise CRM Deal pipeline once a visitor
 * becomes a paying tenant — a pre-signup visitor-event table can't honestly
 * carry them.
 */
export default async function AdminMarketingPage() {
  await requirePlatformOwner("/admin/marketing");

  const [ctaClicks, formSubmits, videoModalOpens, pageViews, inquiryCount] = await Promise.all([
    prisma.marketingEvent.groupBy({
      by: ["label"],
      where: { eventType: "CTA_CLICK" },
      _count: { _all: true },
      orderBy: { _count: { label: "desc" } },
    }),
    prisma.marketingEvent.count({ where: { eventType: "FORM_SUBMIT" } }),
    prisma.marketingEvent.count({ where: { eventType: "VIDEO_MODAL_OPEN" } }),
    prisma.marketingEvent.count({ where: { eventType: "PAGE_VIEW" } }),
    prisma.salesInquiry.count(),
  ]);

  // Only computed when PAGE_VIEW events are actually being tracked — this
  // deployment doesn't currently fire PAGE_VIEW anywhere, so pageViews will
  // be 0 and this stays honestly omitted rather than shown as "0%".
  const conversionRate = pageViews > 0 ? ((inquiryCount / pageViews) * 100).toFixed(1) : null;

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Marketing Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Real, first-party marketing-site telemetry — no third-party analytics vendor.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card glass>
          <CardHeader>
            <CardDescription>Contact form submissions</CardDescription>
            <CardTitle className="text-3xl">{inquiryCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card glass>
          <CardHeader>
            <CardDescription>...of which analytics-tracked</CardDescription>
            <CardTitle className="text-3xl">{formSubmits}</CardTitle>
          </CardHeader>
        </Card>
        <Card glass>
          <CardHeader>
            <CardDescription>Demo modal opens</CardDescription>
            <CardTitle className="text-3xl">{videoModalOpens}</CardTitle>
          </CardHeader>
        </Card>
        <Card glass>
          <CardHeader>
            <CardDescription>Submissions / page views{conversionRate ? "" : " (not tracked yet)"}</CardDescription>
            <CardTitle className="text-3xl">{conversionRate ? `${conversionRate}%` : "—"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>CTA clicks by label</CardTitle>
          <CardDescription>{ctaClicks.length} distinct CTAs tracked</CardDescription>
        </CardHeader>
        <CardContent>
          {ctaClicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No CTA clicks recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Clicks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ctaClicks.map((row) => (
                  <TableRow key={row.label ?? "unlabeled"}>
                    <TableCell className="text-foreground">{row.label ?? "(unlabeled)"}</TableCell>
                    <TableCell className="text-muted-foreground">{row._count._all}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
