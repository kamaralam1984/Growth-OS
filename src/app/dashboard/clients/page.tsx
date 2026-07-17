import Link from "next/link";
import { HeartPulse, ArrowRight, Share2 } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { formatCurrency } from "../_lib/format";
import { ClientHealthBadge } from "./_components/client-health-badge";
import { CustomerSuccessDigestPanel } from "./_components/customer-success-digest-panel";
import { getReferralAttribution } from "@/lib/clients/referral-attribution";

export default async function ClientsPage() {
  const { membership } = await requireActiveMembership("/dashboard/clients");
  const organizationId = membership.organizationId;

  const [clients, healthSnapshots, referralAttribution, latestDigest] = await Promise.all([
    prisma.client.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, status: true, contractValue: true, company: { select: { name: true } } },
    }),
    // Latest snapshot per client — Postgres DISTINCT ON semantics via
    // orderBy+distinct, same "latest per group" pattern used nowhere else
    // yet in this codebase but standard Prisma usage for it.
    prisma.clientHealthSnapshot.findMany({
      where: { organizationId },
      orderBy: [{ clientId: "asc" }, { date: "desc" }],
      distinct: ["clientId"],
    }),
    getReferralAttribution(organizationId),
    prisma.executiveBriefing.findFirst({
      where: { organizationId, type: "CUSTOMER_SUCCESS" },
      orderBy: { createdAt: "desc" },
      select: { id: true, narrativeSummary: true, createdAt: true },
    }),
  ]);

  const healthByClientId = new Map(healthSnapshots.map((s) => [s.clientId, s]));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Real health scores, churn risk, and growth opportunities for every active client — computed nightly from
            actual invoices, projects, contracts, and subscriptions. A client with no snapshot yet just hasn&apos;t
            been scored on its first nightly run.
          </p>
        </div>

        <CustomerSuccessDigestPanel
          latestDigest={
            latestDigest
              ? { id: latestDigest.id, narrativeSummary: latestDigest.narrativeSummary, createdAt: latestDigest.createdAt.toISOString() }
              : null
          }
        />

        {clients.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <HeartPulse className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">
                No clients yet. Clients are created from the CRM or Client Finder once a deal converts.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => {
              const snapshot = healthByClientId.get(client.id);
              return (
                <Link key={client.id} href={`/dashboard/clients/${client.id}`}>
                  <Card glass className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">{client.name}</p>
                          {client.company?.name ? <p className="text-xs text-muted-foreground">{client.company.name}</p> : null}
                        </div>
                        {snapshot ? (
                          <ClientHealthBadge classification={snapshot.classification} />
                        ) : (
                          <span className="text-xs text-muted-foreground">Not yet scored</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {client.contractValue != null ? formatCurrency(client.contractValue, membership.organization.currency) : "No contract value on file"}
                        </span>
                        {snapshot ? <span className="font-medium text-foreground">{snapshot.overallScore}/100</span> : null}
                      </div>
                      <div className="flex items-center justify-end text-xs text-primary">
                        View details <ArrowRight className="ml-1 size-3" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Share2 className="size-4" /> Referral Attribution
            </CardTitle>
            <CardDescription>
              Real Leads manually marked &quot;Referred by&quot; a client, via Quick Actions → Create Lead — never
              AI-inferred.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {referralAttribution.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referred leads recorded yet.</p>
            ) : (
              referralAttribution.map((row) => (
                <div key={row.clientId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link href={`/dashboard/clients/${row.clientId}`} className="font-medium text-foreground hover:underline">
                    {row.clientName}
                  </Link>
                  <span className="text-muted-foreground">
                    {row.referredLeadsCount} referred · {row.convertedCount} converted ·{" "}
                    {formatCurrency(row.convertedValue, membership.organization.currency)} won value
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
