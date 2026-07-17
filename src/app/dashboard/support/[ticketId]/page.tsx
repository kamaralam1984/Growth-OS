import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { TicketThread } from "./_components/ticket-thread";

export default async function SupportTicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/support/${ticketId}`);

  const ticket = await prisma.task.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.organizationId !== membership.organizationId || ticket.type !== "SUPPORT") notFound();

  const comments = await prisma.comment.findMany({
    where: { organizationId: membership.organizationId, docKind: "TASK", docId: ticketId },
    include: { authorUser: { select: { name: true, email: true } }, authorClientPortalUser: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/dashboard/support" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Support
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{ticket.title}</h1>
            {ticket.description && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{ticket.priority}</Badge>
            <Badge variant="outline">{ticket.status}</Badge>
          </div>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Thread</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketThread
              taskId={ticket.id}
              isResolved={ticket.status === "COMPLETED"}
              comments={comments.map((c) => ({
                id: c.id,
                content: c.content,
                isInternalNote: c.isInternalNote,
                authorLabel: c.authorUser?.name ?? c.authorUser?.email ?? c.authorClientPortalUser?.name ?? c.authorClientPortalUser?.email ?? "Unknown",
                createdAt: c.createdAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
