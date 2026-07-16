"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Plus, Trash2, AlertTriangle, Repeat } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  updateCrmTaskStatus,
  deleteCrmTask,
  addChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
} from "../_lib/task-actions";
import type { TaskStatus } from "@/generated/prisma/client";

export interface TaskCardChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  type: string | null;
  priority: string;
  dueDate: string | null;
  assigneeName: string | null;
  dealName: string | null;
  labels: string[];
  isRecurring: boolean;
  checklistItems: TaskCardChecklistItem[];
  dependsOn: Array<{ id: string; title: string; status: TaskStatus }>;
  subtaskCount: number;
}

const STATUS_OPTIONS: TaskStatus[] = ["PENDING", "RUNNING", "BLOCKED", "COMPLETED", "CANCELLED"];

const PRIORITY_CLASS: Record<string, string> = {
  LOW: "bg-sky-500/15 text-sky-500",
  NORMAL: "bg-muted text-muted-foreground",
  HIGH: "bg-amber-500/15 text-amber-500",
  URGENT: "bg-red-500/15 text-red-500",
};

export function TaskCard({ task }: { task: TaskCardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [newItem, setNewItem] = useState("");

  const blockedByIncomplete = task.dependsOn.filter((d) => d.status !== "COMPLETED");
  const checklistDone = task.checklistItems.filter((i) => i.done).length;

  function handleStatusChange(status: TaskStatus) {
    startTransition(async () => {
      await updateCrmTaskStatus(task.id, status);
      router.refresh();
    });
  }

  function handleAddItem() {
    if (!newItem.trim()) return;
    const label = newItem.trim();
    setNewItem("");
    startTransition(async () => {
      await addChecklistItem(task.id, label);
      router.refresh();
    });
  }

  return (
    <div className="glass-panel flex flex-col gap-2 rounded-xl p-3 text-sm shadow-card">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="flex min-w-0 items-start gap-1.5 text-left">
          {expanded ? <ChevronDown className="mt-0.5 size-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0" />}
          <span className="min-w-0 truncate font-medium text-foreground">{task.title}</span>
        </button>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLASS[task.priority] ?? PRIORITY_CLASS.NORMAL}`}>
          {task.priority}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {task.type && <Badge variant="outline">{task.type}</Badge>}
        {task.dueDate && <span>Due {task.dueDate}</span>}
        {task.dealName && <span>· {task.dealName}</span>}
        {task.assigneeName && <span>· {task.assigneeName}</span>}
        {task.isRecurring && <Repeat className="size-3" />}
        {blockedByIncomplete.length > 0 && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="size-3" /> Blocked by {blockedByIncomplete.length}
          </span>
        )}
      </div>

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {l}
            </span>
          ))}
        </div>
      )}

      {task.checklistItems.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Checklist: {checklistDone}/{task.checklistItems.length}
        </p>
      )}
      {task.subtaskCount > 0 && <p className="text-[11px] text-muted-foreground">{task.subtaskCount} subtask(s)</p>}

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={task.status}
          onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
          className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() =>
            startTransition(async () => {
              await deleteCrmTask(task.id);
              router.refresh();
            })
          }
          aria-label="Delete task"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-2">
          {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
          {task.checklistItems.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  startTransition(async () => {
                    await toggleChecklistItem(item.id, e.target.checked);
                    router.refresh();
                  })
                }
              />
              <span className={item.done ? "flex-1 text-muted-foreground line-through" : "flex-1 text-foreground"}>{item.label}</span>
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    await deleteChecklistItem(item.id);
                    router.refresh();
                  })
                }
                aria-label="Remove checklist item"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </label>
          ))}
          <div className="flex items-center gap-1.5">
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Add checklist item…"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
            />
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleAddItem} aria-label="Add checklist item">
              <Plus className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
