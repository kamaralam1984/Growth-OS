import Link from "next/link";
import { FileText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "../../_lib/format";
import { requireActiveMembership } from "../../_lib/require-membership";
import { GenerateProposalForm } from "./_components/generate-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  DRAFT: "outline",
  SENT: "accent",
  ACCEPTED: "default",
  REJECTED: "secondary",
};

export default async function ProposalsPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/proposals");
  const organizationId = membership.organizationId;

  const [proposals, companies, deals, projects] = await Promise.all([
    prisma.proposal.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } } },
    }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Proposals</h1>
            <p className="text-sm text-muted-foreground">
              Real proposals, drafted by your Proposal agent — Executive Summary through Call to Action, structured
              and editable before you send.
            </p>
          </div>
          <GenerateProposalForm companies={companies} deals={deals} projects={projects} />
        </div>

        {proposals.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <FileText className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No proposals yet. Generate your first one with AI.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {proposals.map((proposal) => (
              <Link key={proposal.id} href={`/dashboard/proposal/proposals/${proposal.id}`}>
                <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">{proposal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {proposal.company?.name ?? "No company"} · {proposal.createdAt.toLocaleDateString()}
                        {proposal.openCount > 0 ? ` · Opened ${proposal.openCount}×` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {proposal.value != null && (
                        <span className="text-sm font-medium text-primary">{formatCurrency(proposal.value, membership.organization.currency)}</span>
                      )}
                      <Badge variant={STATUS_VARIANT[proposal.status]}>{proposal.status}</Badge>
                    </div>
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
