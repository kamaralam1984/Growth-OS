"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, CheckCircle2, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createSprint, startSprint, completeSprint, deleteSprint, assignTaskToSprint } from "../actions";
import { BurndownChart } from "./burndown-chart";
import type { BurndownPoint } from "@/lib/projects/burndown";

export interface SprintTaskRow {
  id: string;
  title: string;
  status: string;
}

export interface SprintRow {
  id: string;
  name: string;
  goal: string | null;
  startDate: string;
  endDate: string;
  capacityHours: number | null;
  status: "PLANNING" | "ACTIVE" | "COMPLETED";
  tasks: SprintTaskRow[];
  burndown: { points: BurndownPoint[]; velocityHours: number } | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PLANNING: "outline",
  ACTIVE: "accent",
  COMPLETED: "default",
};

function SprintCard({ sprint, unassignedTasks, canManage, onChange }: { sprint: SprintRow; unassignedTasks: Array<{ id: string; title: string }>; canManage: boolean; onChange: () => void }) {
  const [pending, startTransition] = useTransition();
  const [addTaskId, setAddTaskId] = useState("");
  const [notes, setNotes] = useState("");

  function handleStart() {
    startTransition(async () => {
      await startSprint(sprint.id);
      onChange();
    });
  }
  function handleComplete() {
    startTransition(async () => {
      await completeSprint(sprint.id, notes || undefined);
      onChange();
    });
  }
  function handleDelete() {
    startTransition(async () => {
      await deleteSprint(sprint.id);
      onChange();
    });
  }
  function handleAddTask() {
    if (!addTaskId) return;
    startTransition(async () => {
      await assignTaskToSprint(addTaskId, sprint.id);
      setAddTaskId("");
      onChange();
    });
  }
  function handleRemoveTask(taskId: string) {
    startTransition(async () => {
      await assignTaskToSprint(taskId, null);
      onChange();
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">{sprint.name}</CardTitle>
          {sprint.goal && <p className="text-xs text-muted-foreground">{sprint.goal}</p>}
          <p className="text-xs text-muted-foreground">
            {new Date(sprint.startDate).toLocaleDateString()} – {new Date(sprint.endDate).toLocaleDateString()}
            {sprint.capacityHours != null ? ` · ${sprint.capacityHours}h capacity` : ""}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[sprint.status]}>{sprint.status}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sprint.burndown && sprint.status !== "PLANNING" && (
          <div className="rounded-lg border border-border p-3">
            <BurndownChart points={sprint.burndown.points} totalTasks={sprint.tasks.length} />
            <p className="mt-1 text-xs text-muted-foreground">Velocity: {sprint.burndown.velocityHours.toFixed(1)}h completed</p>
          </div>
        )}

        <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {sprint.tasks.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No tasks in this sprint yet.</p>
          ) : (
            sprint.tasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between gap-2 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{task.title}</span>
                  <Badge variant="outline">{task.status.replace(/_/g, " ")}</Badge>
                </div>
                {canManage && sprint.status !== "COMPLETED" && (
                  <button type="button" onClick={() => handleRemoveTask(task.id)} className="text-muted-foreground hover:text-foreground" aria-label="Remove from sprint">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {canManage && sprint.status !== "COMPLETED" && unassignedTasks.length > 0 && (
          <div className="flex gap-2">
            <Select value={addTaskId} onChange={(e) => setAddTaskId(e.target.value)} className="flex-1">
              <option value="">Add a task to this sprint…</option>
              {unassignedTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="outline" onClick={handleAddTask} disabled={pending || !addTaskId}>
              <Plus className="size-4" />
            </Button>
          </div>
        )}

        {canManage && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {sprint.status === "PLANNING" && (
              <Button type="button" size="sm" onClick={handleStart} disabled={pending}>
                <Play className="size-4" /> Start sprint
              </Button>
            )}
            {sprint.status === "ACTIVE" && (
              <>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Retrospective notes (optional)" className="max-w-xs" />
                <Button type="button" size="sm" onClick={handleComplete} disabled={pending}>
                  <CheckCircle2 className="size-4" /> Complete sprint
                </Button>
              </>
            )}
            {sprint.status === "PLANNING" && (
              <Button type="button" size="sm" variant="ghost" onClick={handleDelete} disabled={pending} className="text-destructive">
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SprintBoard({
  projectId,
  sprints,
  unassignedTasks,
  canManage,
}: {
  projectId: string;
  sprints: SprintRow[];
  unassignedTasks: Array<{ id: string; title: string }>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacityHours, setCapacityHours] = useState("");

  function onChange() {
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSprint(projectId, {
        name,
        goal: goal || undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        capacityHours: capacityHours ? Number(capacityHours) : undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setGoal("");
      setStartDate("");
      setEndDate("");
      setCapacityHours("");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          {!open ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> New sprint
            </Button>
          ) : null}
        </div>
      )}

      {open && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">New sprint</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Name" htmlFor="sprint-name" required className="sm:col-span-2">
                <Input id="sprint-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </FormField>
              <FormField label="Goal (optional)" htmlFor="sprint-goal" className="sm:col-span-2">
                <Input id="sprint-goal" value={goal} onChange={(e) => setGoal(e.target.value)} />
              </FormField>
              <FormField label="Start date" htmlFor="sprint-start" required>
                <Input id="sprint-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </FormField>
              <FormField label="End date" htmlFor="sprint-end" required>
                <Input id="sprint-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </FormField>
              <FormField label="Capacity hours (optional)" htmlFor="sprint-capacity">
                <Input id="sprint-capacity" type="number" min="0" step="0.5" value={capacityHours} onChange={(e) => setCapacityHours(e.target.value)} />
              </FormField>

              {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

              <div className="flex gap-3 sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending || !name.trim() || !startDate || !endDate}>
                  {pending ? "Creating…" : "Create sprint"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {sprints.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">No sprints yet.</CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {sprints.map((sprint) => (
            <SprintCard key={sprint.id} sprint={sprint} unassignedTasks={unassignedTasks} canManage={canManage} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}
