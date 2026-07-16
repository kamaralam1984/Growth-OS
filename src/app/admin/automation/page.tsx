import { Workflow as WorkflowIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requirePlatformOwner, getOrCreatePlatformOrganization } from "@/lib/billing/platform-admin";
import { listWorkflows } from "@/lib/workflows/crud";
import { WorkflowForm } from "./_components/workflow-form";
import { WorkflowList } from "./_components/workflow-list";

/**
 * Platform-scoped counterpart to /dashboard/automation — same
 * listWorkflows()/WorkflowForm/WorkflowList as the tenant page, just scoped
 * to the one real "platform" Organization every admin-authored Workflow
 * belongs to (see getOrCreatePlatformOrganization) instead of a
 * membership-derived tenant org. See src/app/admin/automation/actions.ts's
 * doc comment for why this needed its own action layer rather than reusing
 * the tenant one directly.
 */
export default async function AdminAutomationPage() {
  await requirePlatformOwner("/admin/automation");
  const org = await getOrCreatePlatformOrganization();

  const workflows = await listWorkflows(org.id);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <WorkflowIcon className="size-5" /> Automation Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform-level workflows — the same drag-and-drop, multi-step automation engine every organization uses
            at <code className="text-xs">/dashboard/automation</code>, scoped to a dedicated internal platform
            workspace instead of any one customer&apos;s. Best suited for control-flow/AI/notification automations —
            CRM- and communication-touching steps operate on this workspace&apos;s own (empty) data, not a real
            tenant&apos;s.
          </p>
        </div>
        <WorkflowForm />
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
    </Container>
  );
}
