"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { addManualMemory } from "../actions";
import type { AgentOption } from "./memory-manager";

const MEMORY_TYPE_OPTIONS = [
  { value: "KNOWLEDGE", label: "Knowledge" },
  { value: "PREFERENCE", label: "Preference" },
  { value: "GOAL", label: "Goal" },
  { value: "PAST_DECISION", label: "Past decision" },
  { value: "CLIENT_CONTEXT", label: "Client context" },
  { value: "TASK", label: "Task" },
  { value: "MEETING_NOTE", label: "Meeting note" },
] as const;

export interface AddMemoryFormProps {
  agents: AgentOption[];
}

/**
 * Manual memory entry — open to any active member (not gated to
 * OWNER/ADMIN, unlike pin/archive/delete below), calling storeAgentMemory
 * directly via the addManualMemory Server Action with sourceKind: "MANUAL".
 */
export function AddMemoryForm({ agents }: AddMemoryFormProps) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [type, setType] = useState<(typeof MEMORY_TYPE_OPTIONS)[number]["value"]>("KNOWLEDGE");
  const [content, setContent] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agentId || !content.trim()) return;
    startTransition(async () => {
      const result = await addManualMemory({ agentId, type, content });
      if (!result.ok) {
        toast.error(result.error ?? "Could not save this memory.");
        return;
      }
      toast.success("Memory added.");
      setContent("");
      router.refresh();
    });
  }

  if (agents.length === 0) {
    return <p className="text-sm text-muted-foreground">No AI agents exist yet for this organization.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Agent" htmlFor="memory-agent" required>
          <Select id="memory-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type.replaceAll("_", " ")})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Type" htmlFor="memory-type" required>
          <Select id="memory-type" value={type} onChange={(e) => setType(e.target.value as (typeof MEMORY_TYPE_OPTIONS)[number]["value"])}>
            {MEMORY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
      </div>

      <FormField label="Content" htmlFor="memory-content" required hint="Encrypted at rest — write real, specific content, not a placeholder.">
        <textarea
          id="memory-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={4000}
          placeholder='e.g. "Client prefers monthly invoicing over quarterly."'
          className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </FormField>

      <div>
        <Button type="submit" disabled={pending || !agentId || !content.trim()}>
          {pending ? "Saving..." : "Add memory"}
        </Button>
      </div>
    </form>
  );
}
