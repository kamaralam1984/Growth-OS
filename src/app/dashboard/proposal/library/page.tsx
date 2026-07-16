import Link from "next/link";
import { FileText, ReceiptText, FileSignature, Receipt, ScrollText, LayoutTemplate } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";

/**
 * The Document Library — a single cross-type catalog of everything the
 * generator has produced (Proposals/Quotations/Contracts/Invoices/Legal
 * &amp; Project Docs), plus a link back to the file-upload vault at
 * /dashboard/documents for uploaded PDFs/certificates/case studies. Global
 * search (Cmd+K) already indexes every one of these kinds — this page is
 * the browsable equivalent for scanning everything at once.
 */
export default async function DocumentLibraryPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { membership } = await requireActiveMembership("/dashboard/proposal/library");
  const organizationId = membership.organizationId;
  const { q } = await searchParams;
  const query = q?.trim();
  const filter = query ? { contains: query, mode: "insensitive" as const } : undefined;

  const [proposals, quotations, contracts, invoices, businessDocuments, templatesCount, uploadedDocumentsCount] = await Promise.all([
    prisma.proposal.findMany({ where: { organizationId, ...(filter ? { title: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true, createdAt: true } }),
    prisma.quotation.findMany({ where: { organizationId, ...(filter ? { title: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, quotationNumber: true, status: true } }),
    prisma.contract.findMany({ where: { organizationId, ...(filter ? { title: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, contractNumber: true, status: true } }),
    prisma.invoice.findMany({ where: { organizationId, ...(filter ? { invoiceNumber: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, invoiceNumber: true, status: true } }),
    prisma.businessDocument.findMany({ where: { organizationId, ...(filter ? { title: filter } : {}) }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, kind: true, status: true } }),
    prisma.documentTemplate.count({ where: { organizationId } }),
    prisma.document.count({ where: { organizationId } }),
  ]);

  const sections = [
    { title: "Proposals", icon: FileText, items: proposals.map((p) => ({ id: p.id, label: p.title, sub: p.status, href: `/dashboard/proposal/proposals/${p.id}` })) },
    { title: "Quotations", icon: ReceiptText, items: quotations.map((q) => ({ id: q.id, label: q.title, sub: `${q.quotationNumber} · ${q.status}`, href: `/dashboard/proposal/quotations/${q.id}` })) },
    { title: "Contracts", icon: FileSignature, items: contracts.map((c) => ({ id: c.id, label: c.title, sub: `${c.contractNumber} · ${c.status}`, href: `/dashboard/proposal/contracts/${c.id}` })) },
    { title: "Invoices", icon: Receipt, items: invoices.map((i) => ({ id: i.id, label: i.invoiceNumber, sub: i.status, href: `/dashboard/proposal/invoices/${i.id}` })) },
    { title: "Legal & Project Docs", icon: ScrollText, items: businessDocuments.map((d) => ({ id: d.id, label: d.title, sub: `${d.kind.replace(/_/g, " ")} · ${d.status}`, href: `/dashboard/proposal/documents/${d.id}` })) },
  ];

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Document Library</h1>
          <p className="text-sm text-muted-foreground">Every generated document, in one place — search, browse by type, or export.</p>
        </div>

        <form className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search proposals, quotations, contracts, invoices, documents…"
            className="h-11 w-full max-w-md rounded-lg border border-input bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button type="submit" className="h-11 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-accent">
            Search
          </button>
        </form>

        <Card glass>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutTemplate className="size-4" /> Also in your library
              </CardTitle>
              <CardDescription>Reusable templates and the general file-upload vault.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/dashboard/proposal/templates" className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
              {templatesCount} Templates →
            </Link>
            <Link href="/dashboard/documents" className="rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-accent">
              {uploadedDocumentsCount} Uploaded Files (Documents vault) →
            </Link>
          </CardContent>
        </Card>

        {sections.map((section) => (
          <Card key={section.title} glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <section.icon className="size-4" /> {section.title} ({section.items.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {section.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing here{query ? " matching your search" : ""}.</p>
              ) : (
                section.items.map((item) => (
                  <Link key={item.id} href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-accent/30">
                    <span className="truncate text-foreground">{item.label}</span>
                    <Badge variant="outline">{item.sub}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </Container>
    </main>
  );
}
