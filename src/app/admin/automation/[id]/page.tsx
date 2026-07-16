import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { requirePlatformOwner, getOrCreatePlatformOrganization } from "@/lib/billing/platform-admin";
import { getWorkflowWithSteps } from "@/lib/workflows/crud";
import { WorkflowEditor } from "./_components/workflow-editor";
import { RunNowButton } from "./_components/run-now-button";
import { getLatestStepStatuses } from "./_lib/get-latest-step-statuses";
import type { WorkflowStatusInput } from "@/lib/validations/workflows";

const STATUS_VARIANT: Record<WorkflowStatusInput, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  ACTIVE: "accent",
  PAUSED: "secondary",
  ARCHIVED: "outline",
};

/**
 * Platform-scoped counterpart to /dashboard/automation/workflows/[id] — same
 * WorkflowEditor (canvas + list view), just against the platform
 * Organization's own Workflow rows and the admin action layer
 * (src/app/admin/automation/actions.ts). canManage is always true here —
 * every platform owner who can reach this page can manage it, unlike the
 * tenant page's OWNER/ADMIN-vs-MEMBER distinction (requirePlatformOwner is
 * already the privileged gate). Webhooks and the AI Workflow Designer are
 * intentionally not mounted — out of scope for this first pass.
 */
export default async function AdminWorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformOwner(`/admin/automation/${id}`);
  const org = await getOrCreatePlatformOrganization();

  let workflow;
  try {
    workflow = await getWorkflowWithSteps(id);
  } catch {
    notFound();
  }
  if (!workflow || workflow.organizationId !== org.id) {
    notFound();
  }

  const steps = workflow.steps.map((s) => ({
    id: s.id,
    nodeType: s.nodeType,
    name: s.name,
    config: s.config,
    position: s.position,
    nextStepId: s.nextStepId,
    onTrueStepId: s.onTrueStepId,
    onFalseStepId: s.onFalseStepId,
  }));

  const stepStatuses = await getLatestStepStatuses(id);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/admin/automation"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Back to Automation Builder
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{workflow.name}</h1>
              <Badge variant={STATUS_VARIANT[workflow.status]}>{workflow.status}</Badge>
            </div>
            {workflow.description && <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Trigger: {workflow.triggerType} · {workflow.runCount} run{workflow.runCount === 1 ? "" : "s"}
              {workflow.lastRunAt ? ` · last ${new Date(workflow.lastRunAt).toLocaleString()}` : ""}
            </p>
          </div>
          <RunNowButton workflowId={workflow.id} />
        </div>

        <WorkflowEditor workflowId={workflow.id} steps={steps} canManage stepStatuses={stepStatuses} />
      </Container>
    </main>
  );
}
