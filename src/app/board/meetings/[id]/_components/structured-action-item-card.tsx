"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { promoteActionItemToTask } from "@/app/board/action-items/actions";
import type { MeetingActionItem } from "@/lib/ai/agent-runtime";

const PRIORITY_VARIANT: Record<MeetingActionItem["priority"], "outline" | "accent" | "default"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "accent",
  URGENT: "default",
};

/**
 * One structured execution-plan item from a meeting's notesJson.actionItems
 * — the same item generateMeetingSummary already turned into a real
 * ActionItem row (meeting-orchestrator.ts). actionItemId/taskId/dueDate come
 * from that real row (matched by title, the war room page's job), so
 * "Promote to task" reuses the exact same server action the Action Items
 * page uses — no parallel promotion logic.
 */
export function StructuredActionItemCard({
  item,
  actionItemId,
  taskId,
  dueDate,
  canManage,
}: {
  item: MeetingActionItem;
  actionItemId: string | null;
  taskId: string | null;
  dueDate: string | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function promote() {
    if (!actionItemId) return;
    setError(null);
    startTransition(async () => {
      const result = await promoteActionItemToTask(actionItemId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("Promoted to a task.");
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{item.title}</span>
        <Badge variant={PRIORITY_VARIANT[item.priority]}>{item.priority}</Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>Owner: {item.owner}</span>
        <span>Due {dueDate ? new Date(dueDate).toLocaleDateString() : `in ${item.dueInDays}d`}</span>
        <span>KPI: {item.kpi}</span>
        <span>Impact: {item.expectedImpact}</span>
      </div>
      {taskId ? (
        <span className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary">
          <CheckCircle2 className="size-3.5" /> Promoted to a task
        </span>
      ) : canManage && actionItemId ? (
        <Button size="sm" variant="outline" className="w-fit" onClick={promote} disabled={pending}>
          {pending ? "Promoting..." : "Promote to task"}
        </Button>
      ) : null}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
