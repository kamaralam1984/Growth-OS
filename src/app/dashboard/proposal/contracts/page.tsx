import Link from "next/link";
import { FileSignature } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { ContractForm } from "./_components/contract-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  DRAFT: "outline",
  SENT: "accent",
  SIGNED: "default",
  REJECTED: "secondary",
  EXPIRED: "secondary",
  ARCHIVED: "secondary",
};

export default async function ContractsPage() {
  const { membership } = await requireActiveMembership("/dashboard/proposal/contracts");
  const organizationId = membership.organizationId;

  const [contracts, companies, deals, clients] = await Promise.all([
    prisma.contract.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } }, company: { select: { name: true } } } }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Contracts</h1>
            <p className="text-sm text-muted-foreground">Software Development, AMC, Maintenance, Support, Implementation, and Consulting agreements — AI-drafted, e-signature ready.</p>
          </div>
          <ContractForm companies={companies} deals={deals} clients={clients} />
        </div>

        {contracts.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <FileSignature className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No contracts yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {contracts.map((c) => (
              <Link key={c.id} href={`/dashboard/proposal/contracts/${c.id}`}>
                <Card glass className="transition-transform duration-150 hover:-translate-y-0.5">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">
                        {c.title} <span className="text-xs text-muted-foreground">({c.contractNumber})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.client?.name ?? c.company?.name ?? "No client"} · {c.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
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
