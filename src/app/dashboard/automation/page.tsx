import Link from "next/link";
import { Workflow as WorkflowIcon, LayoutTemplate } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { formatRelativeTime } from "@/lib/utils";
import { requireActiveMembership } from "../_lib/require-membership";
import { RuleForm } from "./_components/rule-form";
import { RuleList } from "./_components/rule-list";
import { WorkflowForm } from "./_components/workflow-form";
import { WorkflowList } from "./_components/workflow-list";
import { AiWorkflowDesignerDialog } from "./_components/ai-workflow-designer-dialog";
import { listWorkflows } from "@/lib/workflows/crud";

export default async function AutomationPage() {
  const { membership } = await requireActiveMembership("/dashboard/automation");
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const [rules, recentRuns, workflows] = await Promise.all([
    prisma.automationRule.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { organizationId: membership.organizationId, description: { contains: "Automation rule" } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    listWorkflows(membership.organizationId),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Automation</h1>
            <p className="text-sm text-muted-foreground">
              Real rules that fire inline when something actually happens — a lead lands, a task completes, a
              meeting ends, a decision is made. No queue, no cron — the trigger runs the rule synchronously.
            </p>
          </div>
          {canManage && <RuleForm />}
        </div>

        <RuleList
          rules={rules.map((r) => ({
            id: r.id,
            name: r.name,
            trigger: r.trigger,
            action: r.action,
            active: r.active,
            runCount: r.runCount,
            lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
          }))}
        />

        <div>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
            <WorkflowIcon className="size-4" /> Execution log
          </h2>
          {recentRuns.length === 0 ? (
            <Card glass>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No rules have fired yet.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentRuns.map((run) => (
                <Card key={run.id} glass>
                  <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="text-foreground">{run.description}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(run.createdAt)}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <WorkflowIcon className="size-4" /> Workflows
              </h2>
              <p className="text-sm text-muted-foreground">
                Multi-step, branchable automations — a real DAG of trigger/condition/action steps, with a visual
                drag-and-drop canvas on each workflow&apos;s detail page.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/dashboard/automation/templates">
                  <LayoutTemplate className="size-4" />
                  Browse templates
                </Link>
              </Button>
              {canManage && (
                <>
                  <AiWorkflowDesignerDialog />
                  <WorkflowForm />
                </>
              )}
            </div>
          </div>

          <WorkflowList
            workflows={workflows.map((w) => ({
              id: w.id,
              name: w.name,
              description: w.description,
              status: w.status,
              triggerType: w.triggerType,
              runCount: w.runCount,
              lastRunAt: w.lastRunAt ? w.lastRunAt.toISOString() : null,
            }))}
          />
        </div>
      </Container>
    </main>
  );
}
