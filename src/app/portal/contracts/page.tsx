import { FileSignature } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireClientPortalSession } from "@/lib/client-portal/auth";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  SENT: "accent",
  SIGNED: "default",
  REJECTED: "secondary",
  EXPIRED: "secondary",
  ARCHIVED: "secondary",
};

export default async function PortalContractsPage() {
  const session = await requireClientPortalSession("/portal/contracts");

  const contracts = await prisma.contract.findMany({
    where: { clientId: session.client.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <FileSignature className="size-6" /> Contracts
        </h1>

        {contracts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">No contracts yet.</CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {contracts.map((contract) => (
                <div key={contract.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{contract.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {contract.contractNumber}
                      {contract.signedAt ? ` · Signed ${contract.signedAt.toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={STATUS_VARIANT[contract.status] ?? "outline"}
                    className={contract.status === "REJECTED" ? "border-destructive/30 bg-destructive/10 text-destructive" : undefined}
                  >
                    {contract.status}
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
