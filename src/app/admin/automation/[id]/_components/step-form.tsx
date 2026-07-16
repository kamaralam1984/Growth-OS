"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addWorkflowStepAction } from "../../actions";
import type { WorkflowNodeTypeInput } from "@/lib/validations/workflows";

const NODE_TYPE_OPTIONS: WorkflowNodeTypeInput[] = [
  "TRIGGER",
  "CONDITION",
  "DELAY",
  "LOOP",
  "AI_ACTION",
  "EMAIL",
  "SMS",
  "WEBHOOK",
  "CRM",
  "PROPOSAL",
  "PROJECT",
  "APPROVAL",
  "DOCUMENT",
  "NOTIFICATION",
  "DATABASE",
  "FUNCTION",
  "CUSTOM_API",
];

export function StepForm({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nodeType, setNodeType] = useState<WorkflowNodeTypeInput>("TRIGGER");
  const [name, setName] = useState("");
  const [configText, setConfigText] = useState("{}");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let config: Record<string, unknown>;
    try {
      const parsed = configText.trim() === "" ? {} : JSON.parse(configText);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Config must be a JSON object.");
      }
      config = parsed as Record<string, unknown>;
    } catch {
      setError("Config must be valid JSON (e.g. {}).");
      return;
    }

    startTransition(async () => {
      const result = await addWorkflowStepAction({ workflowId, nodeType, name, config });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setName("");
      setConfigText("{}");
      router.refresh();
    });
  }

  return (
    <Card glass className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Add step</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Step name" htmlFor="step-name" required>
            <Input id="step-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Node type" htmlFor="step-node-type" required>
            <Select id="step-node-type" value={nodeType} onChange={(e) => setNodeType(e.target.value as WorkflowNodeTypeInput)}>
              {NODE_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Config (JSON)"
            htmlFor="step-config"
            hint="Shape depends on the node type — e.g. EMAIL: {to, subject}, CONDITION: {field, operator, value}."
            className="sm:col-span-2"
          >
            <textarea
              id="step-config"
              value={configText}
              onChange={(e) => setConfigText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>

          {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending || !name.trim()}>
              <Plus className="size-4" />
              {pending ? "Adding…" : "Add step"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
