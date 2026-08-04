"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import type { CreateActionItemInput } from "@/lib/validations/action-items";
import { createActionItem } from "../actions";

export interface AssignableAgent {
  id: string;
  name: string;
}

export interface AssignableUser {
  id: string;
  name: string | null;
}

export interface AssignableProject {
  id: string;
  name: string;
}

type AssigneeKind = "none" | "agent" | "user";

export function CreateActionItemForm({
  agents,
  users,
  projects,
}: {
  agents: AssignableAgent[];
  users: AssignableUser[];
  projects: AssignableProject[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeKind, setAssigneeKind] = useState<AssigneeKind>("none");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<CreateActionItemInput["priority"]>("NORMAL");
  const [kpi, setKpi] = useState("");
  const [expectedImpact, setExpectedImpact] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const options = assigneeKind === "agent" ? agents.map((a) => ({ id: a.id, label: a.name })) : assigneeKind === "user" ? users.map((u) => ({ id: u.id, label: u.name ?? "Team member" })) : [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: CreateActionItemInput = {
      title,
      description: description || undefined,
      assignedToAgentId: assigneeKind === "agent" ? assigneeId || undefined : undefined,
      assignedToUserId: assigneeKind === "user" ? assigneeId || undefined : undefined,
      projectId: projectId || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      priority,
      kpi: kpi || undefined,
      expectedImpact: expectedImpact || undefined,
    };
    startTransition(async () => {
      const result = await createActionItem(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success("Action item created.");
      setTitle("");
      setDescription("");
      setAssigneeKind("none");
      setAssigneeId("");
      setProjectId("");
      setDueDate("");
      setPriority("NORMAL");
      setKpi("");
      setExpectedImpact("");
      setOpen(false);
    });
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New action item</Button>;
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle>New action item</CardTitle>
        <CardDescription>Track a real follow-up, optionally assigned and linked to a project.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <FormField label="Title" htmlFor="action-item-title" required>
            <Input
              id="action-item-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Follow up with the client on the revised scope"
              required
            />
          </FormField>

          <FormField label="Description" htmlFor="action-item-description">
            <textarea
              id="action-item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Any context the assignee needs..."
              className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Assign to" htmlFor="action-item-assignee-kind">
              <Select
                id="action-item-assignee-kind"
                value={assigneeKind}
                onChange={(e) => {
                  const kind = e.target.value as AssigneeKind;
                  setAssigneeKind(kind);
                  setAssigneeId(kind === "agent" ? agents[0]?.id ?? "" : kind === "user" ? users[0]?.id ?? "" : "");
                }}
              >
                <option value="none">Unassigned</option>
                <option value="agent">AI agent</option>
                <option value="user">Team member</option>
              </Select>
            </FormField>

            {assigneeKind !== "none" && (
              <FormField label={assigneeKind === "agent" ? "Agent" : "Team member"} htmlFor="action-item-assignee">
                <Select id="action-item-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                  {options.length === 0 && <option value="">None available</option>}
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Project" htmlFor="action-item-project">
              <Select id="action-item-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">Not linked</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="Due date" htmlFor="action-item-due-date">
              <Input id="action-item-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Priority" htmlFor="action-item-priority">
              <Select
                id="action-item-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as CreateActionItemInput["priority"])}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </FormField>

            <FormField label="KPI (optional)" htmlFor="action-item-kpi">
              <Input
                id="action-item-kpi"
                value={kpi}
                onChange={(e) => setKpi(e.target.value)}
                placeholder="e.g. Reply rate on the follow-up sequence"
              />
            </FormField>
          </div>

          <FormField label="Expected business impact (optional)" htmlFor="action-item-expected-impact">
            <Input
              id="action-item-expected-impact"
              value={expectedImpact}
              onChange={(e) => setExpectedImpact(e.target.value)}
              placeholder="e.g. Unblocks 2 stalled deals worth ₹4L"
            />
          </FormField>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !title.trim()}>
              {pending ? "Creating..." : "Create action item"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
