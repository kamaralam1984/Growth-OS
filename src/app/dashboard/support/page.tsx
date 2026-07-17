import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { CreateTicketForm } from "./_components/create-ticket-form";

const STATUS_LABEL: Record<string, string> = {
  BACKLOG: "Open",
  RUNNING: "In progress",
  BLOCKED: "Waiting on customer",
  COMPLETED: "Resolved",
  CANCELLED: "Closed",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  BACKLOG: "accent",
  RUNNING: "default",
  BLOCKED: "secondary",
  COMPLETED: "outline",
  CANCELLED: "outline",
};

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

export default async function SupportPage() {
  const { membership } = await requireActiveMembership("/dashboard/support");

  const tickets = await prisma.task.findMany({
    where: { organizationId: membership.organizationId, type: "SUPPORT" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Support</h1>
            <p className="text-sm text-muted-foreground">Real support tickets — including ones clients raise themselves through the Client Portal.</p>
          </div>
          <CreateTicketForm />
        </div>

        {tickets.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <LifeBuoy className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No support tickets yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((ticket) => (
              <Link key={ticket.id} href={`/dashboard/support/${ticket.id}`}>
                <Card glass className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium text-foreground">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.clientRaised ? "Raised by client" : "Internal"} · {ticket.dueDate ? `SLA: ${ticket.dueDate.toLocaleDateString()}` : "No SLA set"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{ticket.priority}</Badge>
                      <Badge variant={STATUS_VARIANT[ticket.status]}>{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
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
