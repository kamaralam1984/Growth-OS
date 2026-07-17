import { Container } from "@/components/ui/container";
import { requireActiveMembership } from "../../_lib/require-membership";
import { prisma } from "@/lib/prisma";
import { CompanyDnaReview } from "./_components/company-dna-review";

/**
 * Human Approval Workflow (plan §11) — the single review/approve/reject
 * screen for the AI Company Understanding Engine. Always shows the LATEST
 * CompanyDiscoveryRun for this organization: in progress (polls), failed
 * (offer retry), awaiting review (the full Verified/Inference/Unknown +
 * Executive Board + draft-configuration review), or already
 * approved/rejected (read-only history + a "Re-analyze" option).
 */
export default async function CompanyDnaPage() {
  const { membership } = await requireActiveMembership("/dashboard/settings/company-dna");

  const run = await prisma.companyDiscoveryRun.findFirst({
    where: { organizationId: membership.organizationId },
    orderBy: { startedAt: "desc" },
    include: {
      dna: {
        include: {
          competitors: true,
          executiveMeeting: { select: { id: true, title: true, summary: true, notesJson: true, status: true } },
        },
      },
    },
  });

  const organization = await prisma.organization.findUnique({
    where: { id: membership.organizationId },
    select: { name: true, website: true },
  });

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Company DNA</h1>
        <p className="text-sm text-muted-foreground">
          What AI learned about {organization?.name ?? "your company"} from your website
          {run?.dna?.linkedinInsights ? " and LinkedIn" : ""} — verified facts, AI inferences with confidence scores,
          and what it couldn&apos;t determine. Nothing below is live until you approve it.
        </p>
      </div>

      <CompanyDnaReview
        run={
          run
            ? {
                id: run.id,
                status: run.status,
                currentStep: run.currentStep,
                errorMessage: run.errorMessage,
              }
            : null
        }
        dna={run?.dna ?? null}
        hasWebsite={Boolean(organization?.website)}
        canManage={membership.role === "OWNER" || membership.role === "ADMIN"}
      />
    </Container>
  );
}
