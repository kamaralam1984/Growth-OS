"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { setWorkflowStatusAction, deleteWorkflowAction, duplicateWorkflowAction } from "../actions";
import type { WorkflowStatusInput } from "@/lib/validations/workflows";

export interface WorkflowDisplay {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatusInput;
  triggerType: string;
  runCount: number;
  lastRunAt: string | null;
}

const STATUS_VARIANT: Record<WorkflowStatusInput, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  ACTIVE: "accent",
  PAUSED: "secondary",
  ARCHIVED: "outline",
};

const STATUS_OPTIONS: WorkflowStatusInput[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

export function WorkflowList({ workflows }: { workflows: WorkflowDisplay[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (workflows.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No workflows yet. Create one to build a multi-step, branchable automation.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Trigger</th>
            <th className="py-2 pr-4">Runs</th>
            <th className="py-2 pr-4">Last run</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {workflows.map((workflow) => (
            <tr key={workflow.id} className="border-b border-border/60 align-top">
              <td className="py-3 pr-4">
                <Link href={`/admin/automation/${workflow.id}`} className="font-medium text-foreground hover:underline">
                  {workflow.name}
                </Link>
                {workflow.description && <p className="mt-0.5 text-xs text-muted-foreground">{workflow.description}</p>}
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-col gap-1.5">
                  <Badge variant={STATUS_VARIANT[workflow.status]}>{workflow.status}</Badge>
                  <Select
                    aria-label={`Change status for ${workflow.name}`}
                    value={workflow.status}
                    className="h-8 text-xs"
                    onChange={(e) =>
                      startTransition(async () => {
                        await setWorkflowStatusAction(workflow.id, e.target.value as WorkflowStatusInput);
                        router.refresh();
                      })
                    }
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </Select>
                </div>
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{workflow.triggerType}</td>
              <td className="py-3 pr-4 text-muted-foreground">{workflow.runCount}</td>
              <td className="py-3 pr-4 text-muted-foreground">
                {workflow.lastRunAt ? new Date(workflow.lastRunAt).toLocaleString() : "Never"}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await duplicateWorkflowAction(workflow.id);
                        if (result.ok && result.workflowId) router.push(`/admin/automation/${result.workflowId}`);
                        else router.refresh();
                      })
                    }
                  >
                    <Copy className="size-3.5" />
                    Duplicate
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!confirm(`Delete workflow "${workflow.name}"?`)) return;
                      startTransition(async () => {
                        await deleteWorkflowAction(workflow.id);
                        router.refresh();
                      });
                    }}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
