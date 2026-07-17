"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { updateProjectTask, deleteProjectTask } from "../[id]/board/_lib/board-actions";
import { KANBAN_COLUMNS } from "./task-board";
import type { ProjectBoardTask } from "./task-card";

export interface TaskDetailDialogProps {
  task: ProjectBoardTask;
  members: Array<{ userId: string; name: string | null }>;
  milestones: Array<{ id: string; name: string }>;
  sprints: Array<{ id: string; name: string }>;
  canManage: boolean;
  onClose: () => void;
}

export function TaskDetailDialog({ task, members, milestones, sprints, canManage, onClose }: TaskDetailDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(task.title);
  const [assignedToUserId, setAssignedToUserId] = useState(task.assignedToUser?.id ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [milestoneId, setMilestoneId] = useState(task.milestone?.id ?? "");
  const [sprintId, setSprintId] = useState(task.sprint?.id ?? "");
  const [startDate, setStartDate] = useState(task.startDate ? task.startDate.slice(0, 10) : "");
  const [dueDate, setDueDate] = useState(task.dueDate ? task.dueDate.slice(0, 10) : "");
  const [estimatedHours, setEstimatedHours] = useState(task.estimatedHours != null ? String(task.estimatedHours) : "");
  const [visibleToClient, setVisibleToClient] = useState(task.visibleToClient);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateProjectTask(task.id, {
        title,
        assignedToUserId,
        priority,
        status,
        milestoneId,
        sprintId,
        startDate: startDate ? new Date(startDate) : undefined,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        visibleToClient,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  function handleDelete() {
    if (!confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteProjectTask(task.id);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop click-to-close; the real keyboard equivalent (Escape) is already wired globally above (handleEscape), not per-element.
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pure event-bubbling guard (stops the backdrop's close-click from firing when clicking inside the panel), not an interactive control itself. */}
      <div className="glass-panel-strong w-full max-w-lg rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Task details</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <FormField label="Title" htmlFor="td-title">
            <Input id="td-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canManage} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Status" htmlFor="td-status">
              <Select id="td-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={!canManage}>
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
                <option value="BLOCKED">Blocked</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </FormField>
            <FormField label="Priority" htmlFor="td-priority">
              <Select id="td-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} disabled={!canManage}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Assignee" htmlFor="td-assignee">
            <Select id="td-assignee" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)} disabled={!canManage}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? "Team member"}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Milestone" htmlFor="td-milestone">
              <Select id="td-milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} disabled={!canManage}>
                <option value="">None</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Sprint" htmlFor="td-sprint">
              <Select id="td-sprint" value={sprintId} onChange={(e) => setSprintId(e.target.value)} disabled={!canManage}>
                <option value="">None</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Start date" htmlFor="td-start">
              <Input id="td-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!canManage} />
            </FormField>
            <FormField label="Due date" htmlFor="td-due">
              <Input id="td-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={!canManage} />
            </FormField>
          </div>
          <FormField label="Estimated hours" htmlFor="td-hours">
            <Input id="td-hours" type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} disabled={!canManage} />
          </FormField>
          <label className="flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={visibleToClient} onChange={(e) => setVisibleToClient(e.target.checked)} disabled={!canManage} />
            Visible to client in the Client Portal
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {canManage && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={handleDelete} disabled={pending} className="text-destructive">
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button type="button" size="sm" onClick={handleSave} disabled={pending || !title.trim()}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
