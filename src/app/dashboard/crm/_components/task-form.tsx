"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createCrmTask } from "../_lib/task-actions";

const TASK_TYPES = ["CALL", "EMAIL", "MEETING", "PROPOSAL", "RESEARCH", "FOLLOW_UP", "DOCUMENTATION", "APPROVAL", "DEVELOPMENT", "SUPPORT"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const RECURRENCE_RULES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export interface TaskFormProps {
  deals: Array<{ id: string; name: string }>;
  members: Array<{ userId: string; name: string | null; email: string | null }>;
  tasks: Array<{ id: string; title: string }>;
}

export function TaskForm({ deals, members, tasks }: TaskFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [dealId, setDealId] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [labels, setLabels] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<(typeof RECURRENCE_RULES)[number]>("WEEKLY");
  const [dependsOn, setDependsOn] = useState<string[]>([]);

  function reset() {
    setTitle("");
    setDescription("");
    setType("");
    setPriority("NORMAL");
    setDueDate("");
    setDealId("");
    setParentTaskId("");
    setAssignedToUserId("");
    setLabels("");
    setIsRecurring(false);
    setDependsOn([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCrmTask({
        title,
        description,
        type: (type || undefined) as (typeof TASK_TYPES)[number] | undefined,
        priority,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        dealId,
        parentTaskId,
        assignedToUserId,
        labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
        isRecurring,
        recurrenceRule: isRecurring ? recurrenceRule : undefined,
        dependsOnTaskIds: dependsOn,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New Task
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New task</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Title" htmlFor="task-title" required className="sm:col-span-2">
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Description" htmlFor="task-description" className="sm:col-span-2">
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </FormField>
          <FormField label="Type" htmlFor="task-type">
            <Select id="task-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">No type</option>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Priority" htmlFor="task-priority">
            <Select id="task-priority" value={priority} onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Due date" htmlFor="task-due-date">
            <Input id="task-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>
          <FormField label="Assignee" htmlFor="task-assignee">
            <Select id="task-assignee" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name ?? m.email ?? m.userId}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Deal" htmlFor="task-deal">
            <Select id="task-deal" value={dealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">No deal</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Parent task (subtask of)" htmlFor="task-parent">
            <Select id="task-parent" value={parentTaskId} onChange={(e) => setParentTaskId(e.target.value)}>
              <option value="">Top-level task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Labels (comma-separated)" htmlFor="task-labels">
            <Input id="task-labels" value={labels} onChange={(e) => setLabels(e.target.value)} />
          </FormField>
          <FormField label="Depends on" htmlFor="task-depends-on" hint="Hold Ctrl/Cmd to select multiple">
            <select
              id="task-depends-on"
              multiple
              value={dependsOn}
              onChange={(e) => setDependsOn(Array.from(e.target.selectedOptions, (o) => o.value))}
              className="h-24 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground"
            >
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Recurring" htmlFor="task-recurring">
            <div className="flex items-center gap-2">
              <input id="task-recurring" type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
              {isRecurring && (
                <Select value={recurrenceRule} onChange={(e) => setRecurrenceRule(e.target.value as (typeof RECURRENCE_RULES)[number])}>
                  {RECURRENCE_RULES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Saving…" : "Save task"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
