import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { getWorkflowWithSteps } from "@/lib/workflows/crud";
import { listWebhooks } from "@/lib/workflows/webhooks";
import { WorkflowEditor } from "./_components/workflow-editor";
import { RunNowButton } from "./_components/run-now-button";
import { WebhookManager } from "./_components/webhook-manager";
import { WebhookDeliveryLog } from "./_components/webhook-delivery-log";
import { getLatestStepStatuses } from "./_lib/get-latest-step-statuses";
import type { WorkflowStatusInput } from "@/lib/validations/workflows";

const STATUS_VARIANT: Record<WorkflowStatusInput, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  ACTIVE: "accent",
  PAUSED: "secondary",
  ARCHIVED: "outline",
};

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/automation/workflows/${id}`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  let workflow;
  try {
    workflow = await getWorkflowWithSteps(id);
  } catch {
    notFound();
  }
  if (!workflow || workflow.organizationId !== membership.organizationId) {
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
  const webhooks = canManage ? await listWebhooks(membership.organizationId, workflow.id) : [];

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/dashboard/automation"
              className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" /> Back to Automation
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{workflow.name}</h1>
              <Badge variant={STATUS_VARIANT[workflow.status]}>{workflow.status}</Badge>
            </div>
            {workflow.description && <p className="mt-1 text-sm text-muted-foreground">{workflow.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Trigger: {workflow.triggerType} ·{" "}
              <Link href={`/dashboard/automation/workflows/${workflow.id}/runs`} className="underline hover:text-foreground">
                {workflow.runCount} run{workflow.runCount === 1 ? "" : "s"}
              </Link>
              {workflow.lastRunAt ? ` · last ${new Date(workflow.lastRunAt).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage && <RunNowButton workflowId={workflow.id} />}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/automation/workflows/${workflow.id}/runs`}>
                <History className="size-3.5" /> View run history
              </Link>
            </Button>
          </div>
        </div>

        <WorkflowEditor workflowId={workflow.id} steps={steps} canManage={canManage} stepStatuses={stepStatuses} />

        {canManage && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">Webhooks</h2>
            <WebhookManager workflowId={workflow.id} />
          </div>
        )}

        {canManage && webhooks.length > 0 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">Webhook deliveries</h2>
            <p className="-mt-2 text-sm text-muted-foreground">
              Every real <code className="text-xs">WebhookDelivery</code> recorded for this workflow&apos;s
              webhooks — failed outgoing deliveries can be retried manually.
            </p>
            {webhooks.map((webhook) => (
              <Card key={webhook.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Badge variant="outline">{webhook.direction}</Badge>
                    <code className="truncate text-sm font-normal text-muted-foreground">
                      {webhook.direction === "INCOMING" ? webhook.slug : webhook.targetUrl ?? "—"}
                    </code>
                  </CardTitle>
                  <CardDescription>Real delivery history for this webhook, most recent first.</CardDescription>
                </CardHeader>
                <CardContent>
                  <WebhookDeliveryLog webhookId={webhook.id} organizationId={membership.organizationId} canManage={canManage} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
