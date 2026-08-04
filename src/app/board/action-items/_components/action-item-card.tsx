"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bot, User as UserIcon, ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { formatRelativeTime } from "@/lib/utils";
import type { ActionItemStatus, MessagePriority } from "@/generated/prisma/client";
import { updateActionItemStatus, promoteActionItemToTask } from "../actions";

export interface BoardActionItem {
  id: string;
  title: string;
  description: string | null;
  status: ActionItemStatus;
  priority: MessagePriority;
  kpi: string | null;
  expectedImpact: string | null;
  dueDate: string | null;
  createdAt: string;
  taskId: string | null;
  assignedToUser: { id: string; name: string | null } | null;
  assignedToAgent: { id: string; name: string } | null;
  meeting: { id: string; title: string } | null;
  decision: { id: string; topic: string; meetingId: string | null } | null;
  project: { id: string; name: string } | null;
}

const STATUS_VARIANT: Record<ActionItemStatus, "default" | "secondary" | "outline" | "accent"> = {
  OPEN: "outline",
  IN_PROGRESS: "accent",
  DONE: "default",
  CANCELLED: "outline",
};

const PRIORITY_VARIANT: Record<MessagePriority, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "accent",
  URGENT: "default",
};

export function ActionItemCard({
  item,
  canManage,
  isAssignee,
}: {
  item: BoardActionItem;
  canManage: boolean;
  isAssignee: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canUpdateStatus = canManage || isAssignee;
  const canPromote = canManage && !item.taskId;

  function setStatus(status: ActionItemStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateActionItemStatus(item.id, status);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  function promote() {
    setError(null);
    startTransition(async () => {
      const result = await promoteActionItemToTask(item.id);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("Promoted to a task.");
    });
  }

  const sourceMeetingId = item.meeting?.id ?? item.decision?.meetingId ?? null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <div className="flex items-center gap-1.5">
            <Badge variant={PRIORITY_VARIANT[item.priority]}>{item.priority}</Badge>
            <Badge variant={STATUS_VARIANT[item.status]}>{item.status.replace("_", " ")}</Badge>
          </div>
        </div>

        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {item.assignedToAgent ? <Bot className="size-3.5" /> : <UserIcon className="size-3.5" />}
            {item.assignedToAgent?.name ?? item.assignedToUser?.name ?? "Unassigned"}
          </span>
          <span>Created {formatRelativeTime(new Date(item.createdAt))}</span>
          {item.dueDate && <span>Due {new Date(item.dueDate).toLocaleDateString()}</span>}
        </div>

        {(item.kpi || item.expectedImpact) && (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {item.kpi && <span>KPI: {item.kpi}</span>}
            {item.expectedImpact && <span>Expected impact: {item.expectedImpact}</span>}
          </div>
        )}

        {(item.meeting || item.decision || item.project) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {sourceMeetingId && (
              <Link href={`/board/meetings/${sourceMeetingId}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <ArrowUpRight className="size-3" />
                {item.meeting ? `From meeting: ${item.meeting.title}` : `From decision: ${item.decision?.topic}`}
              </Link>
            )}
            {item.project && (
              <Link href={`/dashboard/projects/${item.project.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                <ArrowUpRight className="size-3" />
                Project: {item.project.name}
              </Link>
            )}
          </div>
        )}

        {item.taskId && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-primary">
            <CheckCircle2 className="size-3.5" /> Promoted to a task
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        {(canUpdateStatus || canPromote) && item.status !== "CANCELLED" && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {canUpdateStatus && item.status === "OPEN" && (
              <Button size="sm" variant="outline" onClick={() => setStatus("IN_PROGRESS")} disabled={pending}>
                Start
              </Button>
            )}
            {canUpdateStatus && item.status !== "DONE" && (
              <Button size="sm" onClick={() => setStatus("DONE")} disabled={pending}>
                Mark done
              </Button>
            )}
            {canUpdateStatus && (
              <Button size="sm" variant="ghost" onClick={() => setStatus("CANCELLED")} disabled={pending}>
                Cancel
              </Button>
            )}
            {canPromote && (
              <Button size="sm" variant="outline" onClick={promote} disabled={pending}>
                {pending ? "Promoting..." : "Promote to task"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
