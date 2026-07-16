"use client";

import { Clock, Flag, Layers, Eye } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MessagePriority, TaskStatus } from "@/generated/prisma/client";

export interface ProjectBoardTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: MessagePriority;
  startDate: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  actualHours: number | null;
  labels: string[];
  visibleToClient: boolean;
  clientRaised: boolean;
  assignedToUser: { id: string; name: string | null } | null;
  milestone: { id: string; name: string } | null;
  sprint: { id: string; name: string } | null;
}

const PRIORITY_CLASS: Record<MessagePriority, string> = {
  LOW: "bg-sky-500/15 text-sky-500",
  NORMAL: "bg-muted text-muted-foreground",
  HIGH: "bg-amber-500/15 text-amber-500",
  URGENT: "bg-red-500/15 text-red-500",
};

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function ProjectTaskCard({
  task,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  task: ProjectBoardTask;
  onOpen: () => void;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const overdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;

  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="glass-panel block w-full cursor-grab rounded-xl p-3 text-left text-sm shadow-card active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-foreground">{task.title}</p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", PRIORITY_CLASS[task.priority])}>{task.priority}</span>
      </div>

      {(task.milestone || task.sprint) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.milestone && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Flag className="size-2.5" /> {task.milestone.name}
            </span>
          )}
          {task.sprint && (
            <span className="flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Layers className="size-2.5" /> {task.sprint.name}
            </span>
          )}
        </div>
      )}

      {task.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.labels.slice(0, 3).map((label) => (
            <span key={label} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {task.dueDate && (
            <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
              <Clock className="size-3" /> {new Date(task.dueDate).toLocaleDateString()}
            </span>
          )}
          {task.estimatedHours != null && (
            <span>
              {task.actualHours != null ? `${Math.round(task.actualHours)}h / ` : ""}
              {task.estimatedHours}h
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {task.visibleToClient && <Eye className="size-3" aria-label="Visible to client" />}
          {task.assignedToUser && (
            <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[9px] font-semibold text-foreground" title={task.assignedToUser.name ?? undefined}>
              {initials(task.assignedToUser.name)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
