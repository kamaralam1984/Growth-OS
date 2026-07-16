"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import type { CreateTaskInput } from "@/lib/validations/board";
import { createTask } from "../actions";

export interface AssignableAgent {
  id: string;
  name: string;
}

export interface AssignableUser {
  id: string;
  name: string | null;
}

type AssigneeKind = "agent" | "user";

export function CreateTaskForm({
  agents,
  users,
  projectId,
}: {
  agents: AssignableAgent[];
  users: AssignableUser[];
  projectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>("agent");
  const [assigneeId, setAssigneeId] = useState(agents[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const options = assigneeKind === "agent" ? agents.map((a) => ({ id: a.id, label: a.name })) : users.map((u) => ({ id: u.id, label: u.name ?? "Team member" }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorKind(undefined);
    if (!assigneeId) {
      setError("Choose someone to assign this task to.");
      return;
    }
    const input: CreateTaskInput = {
      title,
      description: description || undefined,
      assignedToAgentId: assigneeKind === "agent" ? assigneeId : undefined,
      assignedToUserId: assigneeKind === "user" ? assigneeId : undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      projectId,
    };
    startTransition(async () => {
      const result = await createTask(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      setTitle("");
      setDescription("");
      setDueDate("");
      setOpen(false);
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Assign a task</Button>;
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>Assign a new task</CardTitle>
        <CardDescription>Give it to an AI executive agent or a human teammate.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Title" htmlFor="task-title" required>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Draft the Q3 proposal for Acme Corp"
              required
            />
          </FormField>

          <FormField label="Description" htmlFor="task-description">
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any context the assignee needs..."
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Assign to" htmlFor="task-assignee-kind" required>
              <Select
                id="task-assignee-kind"
                value={assigneeKind}
                onChange={(e) => {
                  const kind = e.target.value as AssigneeKind;
                  setAssigneeKind(kind);
                  setAssigneeId(kind === "agent" ? agents[0]?.id ?? "" : users[0]?.id ?? "");
                }}
              >
                <option value="agent">AI agent</option>
                <option value="user">Team member</option>
              </Select>
            </FormField>

            <FormField label={assigneeKind === "agent" ? "Agent" : "Team member"} htmlFor="task-assignee" required>
              <Select id="task-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                {options.length === 0 && <option value="">None available</option>}
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField label="Due date" htmlFor="task-due-date">
            <Input id="task-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </FormField>

          {error && <AiErrorBanner error={error} kind={errorKind as "not_connected" | "billing" | "generic" | undefined} />}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim() || !assigneeId}>
              {pending ? "Assigning..." : "Assign task"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
