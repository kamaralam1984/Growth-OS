"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Eye, EyeOff, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { createMilestone, updateMilestone, deleteMilestone } from "../actions";
import type { MilestoneStatusInput } from "@/lib/validations/milestone";

export interface MilestoneRow {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatusInput;
  visibleToClient: boolean;
  clientApprovedAt: string | null;
  clientSatisfactionRating: number | null;
}

const STATUS_VARIANT: Record<MilestoneStatusInput, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "outline",
  IN_PROGRESS: "accent",
  COMPLETED: "default",
  DELAYED: "secondary",
};

export function MilestoneList({ projectId, milestones, canManage }: { projectId: string; milestones: MilestoneRow[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createMilestone(projectId, {
        name,
        description,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        status: "PENDING",
        visibleToClient: true,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setDueDate("");
      setDescription("");
      setAdding(false);
      router.refresh();
    });
  }

  function handleStatusChange(milestone: MilestoneRow, status: MilestoneStatusInput) {
    startTransition(async () => {
      await updateMilestone(milestone.id, {
        name: milestone.name,
        description: milestone.description ?? "",
        dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
        status,
        visibleToClient: milestone.visibleToClient,
      });
      router.refresh();
    });
  }

  function handleToggleVisible(milestone: MilestoneRow) {
    startTransition(async () => {
      await updateMilestone(milestone.id, {
        name: milestone.name,
        description: milestone.description ?? "",
        dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
        status: milestone.status,
        visibleToClient: !milestone.visibleToClient,
      });
      router.refresh();
    });
  }

  function handleDelete(milestoneId: string) {
    if (!confirm("Delete this milestone?")) return;
    startTransition(async () => {
      await deleteMilestone(milestoneId);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex justify-end">
          {!adding ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> New milestone
            </Button>
          ) : null}
        </div>
      )}

      {adding && (
        <Card glass>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">New milestone</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)} aria-label="Close">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Name" htmlFor="ms-name" required className="sm:col-span-2">
                <Input id="ms-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </FormField>
              <FormField label="Due date" htmlFor="ms-due">
                <Input id="ms-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </FormField>
              <FormField label="Description" htmlFor="ms-desc" className="sm:col-span-2">
                <textarea
                  id="ms-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormField>
              {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
              <div className="sm:col-span-2">
                <Button type="submit" size="sm" disabled={pending || !name.trim()}>
                  {pending ? "Creating…" : "Create milestone"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {milestones.map((milestone) => (
          <Card key={milestone.id} glass>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{milestone.name}</p>
                  {milestone.description && <p className="text-xs text-muted-foreground">{milestone.description}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {milestone.dueDate && <span>Due {new Date(milestone.dueDate).toLocaleDateString()}</span>}
                    {milestone.clientApprovedAt && (
                      <span className="flex items-center gap-1 text-primary">
                        <ThumbsUp className="size-3" /> Client approved
                      </span>
                    )}
                    {milestone.clientSatisfactionRating != null && <span>Client rating: {milestone.clientSatisfactionRating}/5</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[milestone.status]}>{milestone.status.replace(/_/g, " ")}</Badge>
                  {canManage && (
                    <>
                      <Select
                        value={milestone.status}
                        onChange={(e) => handleStatusChange(milestone, e.target.value as MilestoneStatusInput)}
                        disabled={pending}
                        className="h-8 text-xs"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="DELAYED">Delayed</option>
                      </Select>
                      <Button size="sm" variant="ghost" onClick={() => handleToggleVisible(milestone)} disabled={pending} aria-label="Toggle client visibility">
                        {milestone.visibleToClient ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(milestone.id)} disabled={pending} className="text-destructive" aria-label="Delete">
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
