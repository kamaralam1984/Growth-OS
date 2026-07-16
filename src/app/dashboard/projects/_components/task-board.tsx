"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { moveTaskStatus } from "../[id]/board/_lib/board-actions";
import { ProjectTaskCard, type ProjectBoardTask } from "./task-card";
import type { TaskStatusInput } from "@/lib/validations/project";

export interface BoardColumn {
  status: TaskStatusInput;
  label: string;
}

export const KANBAN_COLUMNS: BoardColumn[] = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "PENDING", label: "Todo" },
  { status: "RUNNING", label: "In Progress" },
  { status: "REVIEW", label: "Review" },
  { status: "TESTING", label: "Testing" },
  { status: "READY_FOR_CLIENT", label: "Ready for Client" },
  { status: "COMPLETED", label: "Completed" },
  { status: "ARCHIVED", label: "Archived" },
];

/** Real drag-and-drop Task Kanban — native HTML5 DnD, copied from the CRM Deal board's exact pattern (src/app/dashboard/crm/_components/deal-board.tsx), not a new DnD library. */
export function ProjectTaskBoard({ tasks, onOpenTask }: { tasks: ProjectBoardTask[]; onOpenTask: (taskId: string) => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatusInput | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDrop(status: TaskStatusInput) {
    setDragOverColumn(null);
    if (!dragTaskId) return;
    const taskId = dragTaskId;
    setDragTaskId(null);
    startTransition(async () => {
      const result = await moveTaskStatus(taskId, status);
      if (!result.ok) {
        setError(result.error ?? "Couldn't move that task.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {KANBAN_COLUMNS.map((column) => {
          const columnTasks = tasks.filter((t) => t.status === column.status);
          return (
            <div
              key={column.status}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverColumn(column.status);
              }}
              onDragLeave={() => setDragOverColumn((current) => (current === column.status ? null : current))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(column.status);
              }}
              className={`flex w-72 shrink-0 flex-col gap-3 rounded-2xl border p-3 transition-colors ${
                dragOverColumn === column.status ? "border-primary bg-primary/5" : "border-border bg-muted/20"
              }`}
            >
              <div className="flex items-baseline justify-between px-1">
                <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
                <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
              </div>

              <div className="flex flex-col gap-2">
                {columnTasks.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No tasks here.</p>
                )}
                {columnTasks.map((task) => (
                  <ProjectTaskCard
                    key={task.id}
                    task={task}
                    onOpen={() => onOpenTask(task.id)}
                    draggable
                    onDragStart={() => setDragTaskId(task.id)}
                    onDragEnd={() => setDragTaskId(null)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
