"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { startWorkflowRunAction } from "../../../actions";

/**
 * A real manual trigger for this workflow's execution engine — calls
 * startWorkflowRunAction, which calls the real startWorkflowRun
 * (src/lib/workflows/engine.ts). Shown for every workflow regardless of its
 * configured triggerType (not gated to triggerType === "MANUAL"): a genuine
 * "test this workflow manually" affordance is useful even for a workflow
 * whose real trigger is, say, LEAD_CREATED or CRON — this button doesn't
 * change or fake that configured trigger, it just fires one real run right
 * now with a `{ triggeredBy: "manual" }` payload.
 */
export function RunNowButton({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startWorkflowRunAction(workflowId);
      if (!result.ok || !result.runId) {
        toast.error(result.error ?? "Something went wrong starting the run.");
        return;
      }

      const runId = result.runId;
      toast.success("Workflow run started.", {
        description: "Track its real execution on the run trace page.",
        action: {
          label: "View trace",
          onClick: () => router.push(`/dashboard/automation/workflows/${workflowId}/runs/${runId}`),
        },
      });
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleClick} disabled={isPending}>
      {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      Run now
    </Button>
  );
}
