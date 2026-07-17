import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../../../_lib/require-membership";
import { listAccessReviews, type AccessReviewFinding } from "@/lib/security/access-review";
import { AccessReviewPanel, type AccessReviewRow } from "./_components/access-review-panel";

export default async function AccessReviewPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/team/access-review");
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const reviews = await listAccessReviews(membership.organizationId);
  const reviewRows: AccessReviewRow[] = reviews.map((r) => ({
    id: r.id,
    periodLabel: r.periodLabel,
    status: r.status,
    findings: r.findings as unknown as AccessReviewFinding[],
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link href="/dashboard/crm/team" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to Team Workspace
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Access Review</h1>
          <p className="text-sm text-muted-foreground">
            A real, periodic RBAC certification (SOC2 CC6.1 / ISO 27001 A.9) — confirm each active member&apos;s role
            still belongs, or revoke it. A revoked entry genuinely suspends that member&apos;s access, not just a note.
            {!canManage && " Only owners and admins can run access reviews."}
          </p>
        </div>

        {canManage ? (
          <AccessReviewPanel reviews={reviewRows} />
        ) : (
          <p className="text-sm text-muted-foreground">You don&apos;t have permission to view this page.</p>
        )}
      </Container>
    </main>
  );
}
