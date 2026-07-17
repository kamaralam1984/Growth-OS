import Link from "next/link";
import { redirect } from "next/navigation";
import { Newspaper, ArrowRight } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

export default async function BriefListPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fbrief");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    redirect("/onboarding");
  }

  const briefings = await prisma.executiveBriefing.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Executive Briefings</h1>
          <p className="text-sm text-muted-foreground">
            The AI CEO Daily Brief (generated automatically every weekday morning) and Customer Success Agent digests
            (generated on demand) — every figure traces to real business data, never fabricated.
          </p>
        </div>

        {briefings.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Newspaper className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No briefs generated yet — runs weekday mornings at 6am.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {briefings.map((b) => (
              <Link key={b.id} href={`/board/brief/${b.id}`}>
                <Card glass className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{b.type}</Badge>
                        <span className="text-sm font-medium text-foreground">{formatRelativeTime(b.createdAt)}</span>
                      </div>
                      <CardDescription>
                        {b.type === "CUSTOMER_SUCCESS"
                          ? `${b.newLeadsCount} clients need attention · ${b.pendingApprovalsCount} at high churn risk · ${b.risks.length} flagged`
                          : `${b.newLeadsCount} new leads · ${b.pendingApprovalsCount} pending approvals · ${b.risks.length} active risk(s)`}
                      </CardDescription>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground" />
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
