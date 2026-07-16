"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProjectTask } from "../[id]/board/_lib/board-actions";
import type { TaskStatusInput } from "@/lib/validations/project";

export interface CreateProjectTaskFormProps {
  projectId: string;
  members: Array<{ userId: string; name: string | null }>;
  milestones: Array<{ id: string; name: string }>;
  sprints: Array<{ id: string; name: string }>;
  defaultStatus?: TaskStatusInput;
  onDone?: () => void;
}

export function CreateProjectTaskForm({ projectId, members, milestones, sprints, defaultStatus, onDone }: CreateProjectTaskFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(!onDone);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [milestoneId, setMilestoneId] = useState("");
  const [sprintId, setSprintId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [visibleToClient, setVisibleToClient] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createProjectTask(projectId, {
        title,
        assignedToUserId,
        priority,
        status: defaultStatus ?? "BACKLOG",
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
      setTitle("");
      setStartDate("");
      setEstimatedHours("");
      router.refresh();
      if (onDone) onDone();
      else setOpen(false);
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm">
        <Plus className="size-4" /> New task
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">New task</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (onDone) onDone();
            else setOpen(false);
          }}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Title" htmlFor="task-title" required className="sm:col-span-2">
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Assignee" htmlFor="task-assignee">
            <Select id="task-assignee" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? "Team member"}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority" htmlFor="task-priority">
            <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
          </FormField>
          <FormField label="Milestone" htmlFor="task-milestone">
            <Select id="task-milestone" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Sprint" htmlFor="task-sprint">
            <Select id="task-sprint" value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
              <option value="">None</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Start date" htmlFor="task-start">
            <Input id="task-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Due date" htmlFor="task-due">
            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Estimated hours" htmlFor="task-hours">
            <Input id="task-hours" type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
          </FormField>
          <label className="flex items-center gap-1.5 text-sm text-foreground sm:col-span-2">
            <input type="checkbox" checked={visibleToClient} onChange={(e) => setVisibleToClient(e.target.checked)} />
            Visible to client in the Client Portal
          </label>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" size="sm" disabled={pending || !title.trim()}>
              {pending ? "Creating…" : "Create task"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
