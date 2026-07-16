"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleAutomationRule, deleteAutomationRule } from "../actions";

export interface RuleDisplay {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  runCount: number;
  lastRunAt: string | null;
}

const TRIGGER_LABEL: Record<string, string> = {
  LEAD_CREATED: "New lead created",
  TASK_COMPLETED: "Task completed",
  MEETING_ENDED: "Meeting ends",
  DECISION_MADE: "Decision finalized",
};

const ACTION_LABEL: Record<string, string> = {
  CREATE_TASK: "Create a task",
  ASSIGN_AGENT: "Assign an AI agent",
  SEND_NOTIFICATION: "Notify owners/admins",
};

export function RuleList({ rules }: { rules: RuleDisplay[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (rules.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No automation rules yet. Create one to have real events trigger real actions automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rules.map((rule) => (
        <Card key={rule.id} glass>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground">{rule.name}</p>
                <Badge variant={rule.active ? "accent" : "outline"}>{rule.active ? "Active" : "Paused"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                When {TRIGGER_LABEL[rule.trigger] ?? rule.trigger} → {ACTION_LABEL[rule.action] ?? rule.action}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fired {rule.runCount} time{rule.runCount === 1 ? "" : "s"}
                {rule.lastRunAt ? ` · last ${new Date(rule.lastRunAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  startTransition(async () => {
                    await toggleAutomationRule(rule.id, !rule.active);
                    router.refresh();
                  })
                }
              >
                {rule.active ? "Pause" : "Activate"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (!confirm(`Delete rule "${rule.name}"?`)) return;
                  startTransition(async () => {
                    await deleteAutomationRule(rule.id);
                    router.refresh();
                  });
                }}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
