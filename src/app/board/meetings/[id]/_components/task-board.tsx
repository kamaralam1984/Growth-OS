"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { updateTaskStatus, updateTaskProgress } from "@/app/board/tasks/actions";
import type { MessagePriority, TaskStatus } from "@/generated/prisma/client";

export interface WarRoomTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: MessagePriority;
  progress: number;
  dueDate: string | null;
  ownerName: string;
  isAgent: boolean;
  kpi: string | null;
  expectedImpact: string | null;
}

const PRIORITY_VARIANT: Record<MessagePriority, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "accent",
  URGENT: "default",
};

const STATUS_OPTIONS: TaskStatus[] = ["PENDING", "RUNNING", "BLOCKED", "COMPLETED", "CANCELLED"];

function TaskRow({ task, canEdit }: { task: WarRoomTask; canEdit: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <div className="glass-panel flex flex-col gap-2.5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{task.title}</p>
        <Badge variant={PRIORITY_VARIANT[task.priority]}>{task.priority}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Owner: {task.ownerName}</span>
        {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
      </div>
      {(task.kpi || task.expectedImpact) && (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
          {task.kpi && <span>KPI: {task.kpi}</span>}
          {task.expectedImpact && <span>Expected impact: {task.expectedImpact}</span>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.progress}%` }} />
        </div>
        <span className="w-9 shrink-0 text-right text-xs text-muted-foreground">{task.progress}%</span>
      </div>

      {canEdit && (
        <div className="flex items-center gap-2 border-t border-border/60 pt-2.5">
          <Select
            value={task.status}
            onChange={(e) => {
              const status = e.target.value as TaskStatus;
              startTransition(async () => {
                await updateTaskStatus(task.id, status);
                router.refresh();
              });
            }}
            className="h-8 flex-1 text-xs"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            defaultValue={task.progress}
            onMouseUp={(e) => {
              const value = Number((e.target as HTMLInputElement).value);
              startTransition(async () => {
                await updateTaskProgress(task.id, value);
                router.refresh();
              });
            }}
            className="h-8 w-24 accent-primary"
            aria-label="Progress"
          />
        </div>
      )}
    </div>
  );
}

export function TaskBoard({ tasks, canEdit }: { tasks: WarRoomTask[]; canEdit: boolean }) {
  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No tasks assigned from this meeting yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} canEdit={canEdit} />
      ))}
    </div>
  );
}
