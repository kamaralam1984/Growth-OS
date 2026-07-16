"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAutomationRule } from "../actions";
import type { AutomationActionInput, AutomationTriggerInput } from "@/lib/validations/automation";

const TRIGGER_OPTIONS: Array<{ value: AutomationTriggerInput; label: string }> = [
  { value: "LEAD_CREATED", label: "A new lead is created" },
  { value: "TASK_COMPLETED", label: "A task is completed" },
  { value: "MEETING_ENDED", label: "A meeting ends" },
  { value: "DECISION_MADE", label: "A decision is finalized" },
];

const ACTION_OPTIONS: Array<{ value: AutomationActionInput; label: string }> = [
  { value: "CREATE_TASK", label: "Create a task" },
  { value: "ASSIGN_AGENT", label: "Assign an AI agent" },
  { value: "SEND_NOTIFICATION", label: "Notify owners/admins" },
];

const AGENT_TYPES = ["CEO", "SALES", "MARKETING", "PROPOSAL", "OUTREACH"] as const;

export function RuleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTriggerInput>("LEAD_CREATED");
  const [action, setAction] = useState<AutomationActionInput>("CREATE_TASK");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [agentType, setAgentType] = useState<(typeof AGENT_TYPES)[number]>("SALES");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const actionConfig: Record<string, string> =
      action === "CREATE_TASK"
        ? { title: title || "Follow up" }
        : action === "ASSIGN_AGENT"
          ? { title: title || "Review", agentType }
          : { title: title || name, message: message || "Automation rule triggered." };

    startTransition(async () => {
      const result = await createAutomationRule({ name, trigger, action, actionConfig });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setTitle("");
      setMessage("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New rule
      </Button>
    );
  }

  return (
    <Card glass className="w-full">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>New automation rule</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Rule name" htmlFor="rule-name" required className="sm:col-span-2">
            <Input id="rule-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="When" htmlFor="rule-trigger" required>
            <Select id="rule-trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as AutomationTriggerInput)}>
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Then" htmlFor="rule-action" required>
            <Select id="rule-action" value={action} onChange={(e) => setAction(e.target.value as AutomationActionInput)}>
              {ACTION_OPTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>

          {(action === "CREATE_TASK" || action === "ASSIGN_AGENT") && (
            <FormField label="Task title" htmlFor="rule-title" className="sm:col-span-2">
              <Input id="rule-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Follow up on new lead" />
            </FormField>
          )}
          {action === "ASSIGN_AGENT" && (
            <FormField label="Agent" htmlFor="rule-agent" required className="sm:col-span-2">
              <Select id="rule-agent" value={agentType} onChange={(e) => setAgentType(e.target.value as typeof agentType)}>
                {AGENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {action === "SEND_NOTIFICATION" && (
            <FormField label="Notification message" htmlFor="rule-message" className="sm:col-span-2">
              <Input id="rule-message" value={message} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
          )}

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Create rule"}
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
