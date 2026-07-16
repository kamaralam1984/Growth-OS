import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, User, FileText, ReceiptText, FileSignature, Receipt, ScrollText, ListChecks, History } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { formatRelativeTime } from "@/lib/utils";
import { requireActiveMembership } from "../../../_lib/require-membership";
import { DealForm } from "../../_components/deal-form";
import { DealAttachmentUpload } from "../../_components/deal-attachment-upload";
import { DealApprovalRequest } from "../../_components/deal-approval-request";
import { DocumentList } from "@/app/dashboard/documents/_components/document-list";

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/crm/deals/${id}`);

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      dealStage: true,
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
      sourceLead: { select: { id: true, name: true } },
      proposals: { orderBy: { createdAt: "desc" } },
      quotations: { orderBy: { createdAt: "desc" } },
      contracts: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { createdAt: "desc" } },
      businessDocuments: { orderBy: { createdAt: "desc" } },
      tasks: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!deal || deal.organizationId !== membership.organizationId) {
    notFound();
  }

  const [companies, contacts, members, activity] = await Promise.all([
    prisma.company.findMany({ where: { organizationId: membership.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.membership.findMany({
      where: { organizationId: membership.organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.activity.findMany({
      where: { organizationId: membership.organizationId, metadata: { path: ["dealId"], equals: deal.id } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }));
  const contactOptions = contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName ?? ""}`.trim() }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link href="/dashboard/crm/deals" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to Deals
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{deal.name}</h1>
              <Badge variant="outline">{deal.dealStage.name}</Badge>
              <Badge variant={PRIORITY_VARIANT[deal.priority] ?? "secondary"}>{deal.priority}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {deal.value != null && <>{formatCurrency(deal.value, membership.organization.currency)} · </>}
              {deal.probability != null && <>{deal.probability}% probability · </>}
              {deal.expectedCloseDate && <>Expected close {deal.expectedCloseDate.toLocaleDateString()}</>}
            </p>
            {deal.sourceLead && (
              <p className="mt-1 text-xs text-muted-foreground">Converted from lead &ldquo;{deal.sourceLead.name}&rdquo;.</p>
            )}
          </div>
          <DealApprovalRequest dealId={deal.id} approvers={memberOptions.filter((m) => m.userId !== deal.ownerUserId)} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            <DealForm
              companies={companies}
              contacts={contactOptions}
              members={memberOptions}
              initial={{
                id: deal.id,
                name: deal.name,
                companyId: deal.companyId ?? "",
                contactId: deal.contactId ?? "",
                value: deal.value != null ? String(deal.value) : "",
                probability: deal.probability != null ? String(deal.probability) : "",
                expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.toISOString().slice(0, 10) : "",
                ownerUserId: deal.ownerUserId ?? "",
                priority: deal.priority,
                products: deal.products.join(", "),
                services: deal.services.join(", "),
                notes: deal.notes ?? "",
              }}
            />

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="size-4" /> Documents ({deal.proposals.length + deal.quotations.length + deal.contracts.length + deal.invoices.length + deal.businessDocuments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {deal.proposals.length + deal.quotations.length + deal.contracts.length + deal.invoices.length + deal.businessDocuments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents linked yet — generate one from the Proposal &amp; Documents hub.</p>
                ) : (
                  <>
                    {deal.proposals.map((p) => (
                      <Link key={p.id} href={`/dashboard/proposal/proposals/${p.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                        <span className="flex items-center gap-2 text-foreground"><FileText className="size-3.5 text-muted-foreground" /> {p.title}</span>
                        <Badge variant="outline">{p.status}</Badge>
                      </Link>
                    ))}
                    {deal.quotations.map((q) => (
                      <Link key={q.id} href={`/dashboard/proposal/quotations/${q.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                        <span className="flex items-center gap-2 text-foreground"><ReceiptText className="size-3.5 text-muted-foreground" /> {q.title}</span>
                        <Badge variant="outline">{q.status}</Badge>
                      </Link>
                    ))}
                    {deal.contracts.map((c) => (
                      <Link key={c.id} href={`/dashboard/proposal/contracts/${c.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                        <span className="flex items-center gap-2 text-foreground"><FileSignature className="size-3.5 text-muted-foreground" /> {c.title}</span>
                        <Badge variant="outline">{c.status}</Badge>
                      </Link>
                    ))}
                    {deal.invoices.map((inv) => (
                      <Link key={inv.id} href={`/dashboard/proposal/invoices/${inv.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                        <span className="flex items-center gap-2 text-foreground"><Receipt className="size-3.5 text-muted-foreground" /> {inv.invoiceNumber}</span>
                        <Badge variant="outline">{inv.status}</Badge>
                      </Link>
                    ))}
                    {deal.businessDocuments.map((d) => (
                      <Link key={d.id} href={`/dashboard/proposal/documents/${d.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                        <span className="flex items-center gap-2 text-foreground"><ScrollText className="size-3.5 text-muted-foreground" /> {d.title}</span>
                        <Badge variant="outline">{d.status}</Badge>
                      </Link>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="size-4" /> Tasks ({deal.tasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {deal.tasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tasks linked yet.</p>
                ) : (
                  deal.tasks.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                      <span className="text-foreground">{t.title}</span>
                      <Badge variant="outline">{t.status}</Badge>
                    </div>
                  ))
                )}
                <Link href="/dashboard/crm/tasks" className="text-xs text-primary hover:underline">
                  Manage tasks →
                </Link>
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="text-base">Attachments ({deal.documents.length})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <DealAttachmentUpload dealId={deal.id} />
                <DocumentList
                  documents={deal.documents.map((d) => ({
                    id: d.id,
                    name: d.name,
                    folder: d.folder,
                    sizeBytes: d.sizeBytes,
                    companyName: null,
                    createdAt: d.createdAt.toISOString(),
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <aside className="flex flex-col gap-4">
            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Building2 className="size-4" /> Company
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deal.company ? (
                  <Link href={`/dashboard/companies/${deal.company.id}`} className="text-sm text-primary hover:underline">
                    {deal.company.name}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No company linked.</p>
                )}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <User className="size-4" /> Contact
                </CardTitle>
              </CardHeader>
              <CardContent>
                {deal.contact ? (
                  <div>
                    <p className="text-sm text-foreground">
                      {deal.contact.firstName} {deal.contact.lastName ?? ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{deal.contact.email}</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No contact linked.</p>
                )}
              </CardContent>
            </Card>

            <Card glass>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <History className="size-4" /> Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {activity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  activity.map((a) => (
                    <div key={a.id} className="text-xs">
                      <p className="text-foreground">{a.description}</p>
                      <p className="text-muted-foreground">{formatRelativeTime(a.createdAt)}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  );
}
