import Link from "next/link";
import { Workflow as WorkflowIcon } from "lucide-react";

import { Container } from "@/components/ui/container";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { PlatformFlowDiagram } from "./_components/platform-flow-diagram";

/**
 * Read-only documentation page — a visual, n8n-style map of how KVL
 * GrowthOS itself works end to end (Marketing → Lead Capture → AI Research →
 * CRM → Proposal → Project → Delivery → Client Portal → Billing → Analytics
 * → AI Memory, feeding back into AI Research). Purely presentational; see
 * platform-flow-diagram.tsx's doc comment for why this isn't a real,
 * editable Workflow. For an actual working workflow builder, see
 * /admin/automation.
 */
export default async function AdminWorkflowPage() {
  await requirePlatformOwner("/admin/workflow");

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <WorkflowIcon className="size-5" /> Workflow
        </h1>
        <p className="text-sm text-muted-foreground">
          How KVL GrowthOS actually works, stage by stage — a visual reference, not a live automation. Click any
          stage to open it. Looking to build a real, running automation instead? See{" "}
          <Link href="/admin/automation" className="underline hover:text-foreground">
            Automation Builder
          </Link>
          .
        </p>
      </div>

      <PlatformFlowDiagram />
    </Container>
  );
}
