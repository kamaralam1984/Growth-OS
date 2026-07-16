import Link from "next/link";
import { ScrollText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { BusinessDocumentForm } from "./_components/business-document-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  DRAFT: "outline",
  SENT: "accent",
  ACCEPTED: "default",
  REJECTED: "secondary",
  ARCHIVED: "secondary",
};

export default async function BusinessDocumentsPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/documents");
  const organizationId = membership.organizationId;

  const [documents, companies, deals, projects] = await Promise.all([
    prisma.businessDocument.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Legal &amp; Project Docs</h1>
            <p className="text-sm text-muted-foreground">NDA, MSA, SLA, Terms, Privacy, Acceptance Letter, Delivery Certificate, Scope of Work, Requirement Spec, Architecture, Roadmap, Risk Register, Acceptance Criteria, Project Plan, Business Report.</p>
          </div>
          <BusinessDocumentForm companies={companies} deals={deals} projects={projects} />
        </div>

        {documents.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <ScrollText className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No documents yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {documents.map((d) => (
              <Link key={d.id} href={`/dashboard/proposal/documents/${d.id}`}>
                <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.kind.replace(/_/g, " ")} · {d.company?.name ?? "No company"} · {d.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge>
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
