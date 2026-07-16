"use client";

import { useState, useTransition } from "react";
import { Bot, User as UserIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { formatRelativeTime } from "@/lib/utils";
import type { TaskStatus } from "@/generated/prisma/client";
import { runAgentTask, updateTaskStatus } from "../actions";

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  result: string | null;
  dueDate: string | null;
  createdAt: string;
  assignedToAgent: { id: string; name: string } | null;
  assignedToUser: { id: string; name: string | null } | null;
  assignedByUser: { name: string | null } | null;
  assignedByAgent: { name: string } | null;
}

// PENDING/RUNNING/BLOCKED/COMPLETED/CANCELLED are the War Room's original
// AI-agent-task statuses (this board's own domain). BACKLOG/REVIEW/TESTING/
// READY_FOR_CLIENT/ARCHIVED were added for the Project Kanban board and
// never appear here (board/tasks/page.tsx filters to projectId: null) —
// still required as map keys since TypeScript checks the type, not runtime
// usage, but they're otherwise unreachable in this file.
const STATUS_VARIANT: Record<TaskStatus, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "outline",
  RUNNING: "accent",
  BLOCKED: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
  BACKLOG: "outline",
  REVIEW: "accent",
  TESTING: "accent",
  READY_FOR_CLIENT: "secondary",
  ARCHIVED: "outline",
};

export function TaskCard({
  task,
  canManage,
  isAssignee,
}: {
  task: BoardTask;
  canManage: boolean;
  isAssignee: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const canRunAgent = canManage && Boolean(task.assignedToAgent) && (task.status === "PENDING" || task.status === "BLOCKED");
  const canMarkDone = (canManage || isAssignee) && Boolean(task.assignedToUser) && task.status !== "COMPLETED" && task.status !== "CANCELLED";

  function runAgent() {
    setError(null);
    setErrorKind(undefined);
    startTransition(async () => {
      const result = await runAgentTask(task.id);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
      }
    });
  }

  function markStatus(status: TaskStatus) {
    setError(null);
    setErrorKind(undefined);
    startTransition(async () => {
      const result = await updateTaskStatus(task.id, status);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
      }
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">{task.title}</h3>
          <Badge variant={STATUS_VARIANT[task.status]}>{task.status}</Badge>
        </div>

        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {task.assignedToAgent ? <Bot className="size-3.5" /> : <UserIcon className="size-3.5" />}
            {task.assignedToAgent?.name ?? task.assignedToUser?.name ?? "Unassigned"}
          </span>
          <span>Created {formatRelativeTime(new Date(task.createdAt))}</span>
          {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
        </div>

        {task.result && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Delivered result</p>
            <p className="whitespace-pre-wrap text-sm text-foreground/90">{task.result}</p>
          </div>
        )}

        {error && <AiErrorBanner error={error} kind={errorKind as "not_connected" | "billing" | "generic" | undefined} />}

        {(canRunAgent || canMarkDone) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {canRunAgent && (
              <Button size="sm" onClick={runAgent} disabled={pending}>
                {pending ? "Working..." : "Run agent now"}
              </Button>
            )}
            {canMarkDone && (
              <>
                <Button size="sm" variant="outline" onClick={() => markStatus("COMPLETED")} disabled={pending}>
                  Mark completed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => markStatus("CANCELLED")} disabled={pending}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
