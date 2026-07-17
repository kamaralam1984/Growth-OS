import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HeartPulse, ShieldAlert, FolderKanban, FileText, ReceiptText, Repeat } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { ClientHealthBadge } from "../_components/client-health-badge";
import { ClientHealthFactorsCard } from "../_components/client-health-factors-card";
import { ClientChurnCard } from "../_components/client-churn-card";
import { ClientOpportunitiesPanel } from "../_components/client-opportunities-panel";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/clients/${id}`);

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      projects: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, status: true } },
      contracts: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, title: true, status: true, endDate: true } },
      invoices: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, invoiceNumber: true, status: true, grandTotal: true, amountPaid: true } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, name: true, status: true, amount: true, renewalDate: true } },
    },
  });

  if (!client || client.organizationId !== membership.organizationId) {
    notFound();
  }

  const [[healthSnapshot], churnAssessment, opportunities] = await Promise.all([
    prisma.clientHealthSnapshot.findMany({ where: { clientId: id }, orderBy: { date: "desc" }, take: 1 }),
    prisma.churnRiskAssessment.findUnique({ where: { clientId: id } }),
    prisma.clientOpportunity.findMany({ where: { clientId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/clients" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Clients
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{client.name}</h1>
            {client.company ? (
              <Link href={`/dashboard/companies/${client.company.id}`} className="text-sm text-primary hover:underline">
                {client.company.name}
              </Link>
            ) : null}
          </div>
          {healthSnapshot ? <ClientHealthBadge classification={healthSnapshot.classification} /> : <Badge variant="outline">Not yet scored</Badge>}
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4 text-primary" /> Client Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthSnapshot ? (
              <ClientHealthFactorsCard snapshot={healthSnapshot} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No health snapshot yet — this client will be scored on the next nightly run (real invoice, project,
                contract, and subscription data; never a placeholder number).
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderKanban className="size-4 text-muted-foreground" /> Projects ({client.projects.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked projects.</p>
              ) : (
                client.projects.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{p.name}</span>
                    <Badge variant="outline">{p.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-muted-foreground" /> Contracts ({client.contracts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.contracts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked contracts.</p>
              ) : (
                client.contracts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{c.title}</span>
                    <Badge variant="outline">{c.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ReceiptText className="size-4 text-muted-foreground" /> Invoices ({client.invoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked invoices.</p>
              ) : (
                client.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{inv.invoiceNumber}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(inv.amountPaid, membership.organization.currency)} / {formatCurrency(inv.grandTotal, membership.organization.currency)}
                    </span>
                    <Badge variant="outline">{inv.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Repeat className="size-4 text-muted-foreground" /> Subscriptions ({client.subscriptions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {client.subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No linked subscriptions.</p>
              ) : (
                client.subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{s.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(s.amount, membership.organization.currency)}</span>
                    <Badge variant="outline">{s.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 text-primary" /> Churn Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {churnAssessment ? (
              <ClientChurnCard assessment={churnAssessment} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No churn assessment yet — this needs a health snapshot first, computed on the next nightly run.
              </p>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4 text-primary" /> Growth Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClientOpportunitiesPanel opportunities={opportunities} currency={membership.organization.currency} />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
