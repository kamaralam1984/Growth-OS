"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Handshake, UserCog, Flag, ListChecks } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addCompanyToCrm, assignCompanyOwner, markCompanyPriority } from "../actions";
import { createTask } from "@/app/board/tasks/actions";

const PRIORITY_OPTIONS = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
type Priority = (typeof PRIORITY_OPTIONS)[number];

const PRIORITY_VARIANT: Record<Priority, "outline" | "secondary" | "accent" | "default"> = {
  LOW: "outline",
  NORMAL: "secondary",
  HIGH: "accent",
  URGENT: "default",
};

export interface CrmActionsPanelProps {
  companyId: string;
  hasLead: boolean;
  ownerUserId: string | null;
  priority: Priority;
  members: Array<{ id: string; name: string | null }>;
}

export function CrmActionsPanel({ companyId, hasLead, ownerUserId, priority, members }: CrmActionsPanelProps) {
  const router = useRouter();
  const [addingToCrm, startAddToCrm] = useTransition();
  const [assigningOwner, startAssignOwner] = useTransition();
  const [markingPriority, startMarkPriority] = useTransition();
  const [creatingTask, startCreateTask] = useTransition();
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState(members[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  function handleAddToCrm() {
    setMessage(null);
    startAddToCrm(async () => {
      const result = await addCompanyToCrm(companyId);
      setMessage(result.ok ? (result.alreadyInCrm ? "Already in CRM." : "Added to CRM pipeline.") : result.error ?? "Something went wrong.");
      if (result.ok) router.refresh();
    });
  }

  function handleAssignOwner(value: string) {
    startAssignOwner(async () => {
      await assignCompanyOwner(companyId, value || null);
      router.refresh();
    });
  }

  function handleMarkPriority(value: Priority) {
    startMarkPriority(async () => {
      await markCompanyPriority(companyId, value);
      router.refresh();
    });
  }

  function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim() || !taskAssignee) return;
    setMessage(null);
    startCreateTask(async () => {
      const result = await createTask({ title: taskTitle, assignedToUserId: taskAssignee, companyId });
      setMessage(result.ok ? "Task created." : result.error ?? "Something went wrong.");
      if (result.ok) {
        setTaskTitle("");
        router.refresh();
      }
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="text-base">CRM actions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        {message && <p className="text-xs text-primary">{message}</p>}

        <Button size="sm" variant="outline" onClick={handleAddToCrm} disabled={addingToCrm || hasLead}>
          <Handshake className="size-3.5" />
          {hasLead ? "Already in CRM" : addingToCrm ? "Adding…" : "Add to CRM"}
        </Button>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="crm-owner-select" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserCog className="size-3.5" /> Owner
          </label>
          <Select
            id="crm-owner-select"
            value={ownerUserId ?? ""}
            onChange={(e) => handleAssignOwner(e.target.value)}
            disabled={assigningOwner}
            className="h-9 text-sm"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? "Unnamed member"}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          {/* Not a form <label> — this heads a group of toggle buttons, not one single control. */}
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Flag className="size-3.5" /> Priority
          </span>
          <div role="group" aria-label="Priority" className="flex flex-wrap gap-1.5">
            {PRIORITY_OPTIONS.map((opt) => (
              <button key={opt} type="button" onClick={() => handleMarkPriority(opt)} disabled={markingPriority}>
                <Badge variant={priority === opt ? PRIORITY_VARIANT[opt] : "outline"} className={priority === opt ? "" : "opacity-60"}>
                  {opt}
                </Badge>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleCreateTask} className="flex flex-col gap-1.5 border-t border-border pt-3">
          {/* Not a form <label> — this heads the whole mini-form below (title + assignee + submit), not one single control. */}
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ListChecks className="size-3.5" /> Create task
          </span>
          <Input
            aria-label="Task title"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task title"
            className="h-9 text-sm"
          />
          <Select aria-label="Assign task to" value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="h-9 text-sm">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? "Unnamed member"}
              </option>
            ))}
          </Select>
          <Button type="submit" size="sm" disabled={creatingTask || !taskTitle.trim() || !taskAssignee}>
            {creatingTask ? "Creating…" : "Create task"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
