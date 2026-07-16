import { FileText } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";
import { getPortalProjectIds, proposalScopeWhere } from "@/lib/client-portal/scope";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  SENT: "accent",
  ACCEPTED: "default",
  REJECTED: "secondary",
};

export default async function PortalProposalsPage() {
  const session = await requireClientPortalSession("/portal/proposals");
  const projectIds = await getPortalProjectIds(session);

  const proposals = await prisma.proposal.findMany({
    where: proposalScopeWhere(session, projectIds),
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <FileText className="size-6" /> Proposals
        </h1>

        {proposals.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No proposals yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {proposals.map((proposal) => (
                <div key={proposal.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{proposal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {proposal.sentAt ? `Sent ${proposal.sentAt.toLocaleDateString()}` : `Created ${proposal.createdAt.toLocaleDateString()}`}
                    </p>
                  </div>
                  <Badge
                    variant={STATUS_VARIANT[proposal.status] ?? "outline"}
                    className={proposal.status === "REJECTED" ? "border-destructive/30 bg-destructive/10 text-destructive" : undefined}
                  >
                    {proposal.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </Container>
    </main>
  );
}
