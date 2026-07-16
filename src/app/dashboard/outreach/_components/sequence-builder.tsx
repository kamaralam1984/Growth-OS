"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown, ListOrdered } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { createSequence } from "../_lib/sequence-actions";
import type { SequenceStepInput } from "@/lib/validations/outreach";

const STEP_TYPES = ["EMAIL", "WAIT", "LINKEDIN", "REMINDER", "MEETING_REQUEST"] as const;
const TONE_OPTIONS = ["PROFESSIONAL", "ENTERPRISE", "FRIENDLY", "FORMAL", "CONSULTATIVE"] as const;

function emptyStep(order: number): SequenceStepInput {
  return { order, type: "EMAIL", delayDays: order === 0 ? 0 : 3, tone: "PROFESSIONAL" };
}

export function SequenceBuilder({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("Default sequence");
  const [steps, setSteps] = useState<SequenceStepInput[]>([emptyStep(0), { order: 1, type: "WAIT", delayDays: 3 }, emptyStep(2)]);
  const [error, setError] = useState<string | null>(null);

  function updateStep(index: number, patch: Partial<SequenceStepInput>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function addStep() {
    setSteps((prev) => [...prev, emptyStep(prev.length)]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((s, i) => ({ ...s, order: i }));
    });
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await createSequence({ name, campaignId, steps });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="size-4" /> Sequence builder
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <FormField label="Sequence name" htmlFor="sequence-name">
          <Input id="sequence-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>

        <div className="flex flex-col gap-2">
          {steps.map((step, index) => (
            <div key={index} className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]">
              <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
              <Select value={step.type} onChange={(e) => updateStep(index, { type: e.target.value as SequenceStepInput["type"] })} className="h-9 text-sm">
                {STEP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
              {step.type !== "WAIT" ? (
                <Select value={step.tone ?? "PROFESSIONAL"} onChange={(e) => updateStep(index, { tone: e.target.value as SequenceStepInput["tone"] })} className="h-9 text-sm">
                  {TONE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">No content — just a delay before the next step</span>
              )}
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  value={step.delayDays ?? 0}
                  onChange={(e) => updateStep(index, { delayDays: Number(e.target.value) })}
                  className="h-9 w-20 text-sm"
                />
                <span className="text-xs text-muted-foreground">days delay</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveStep(index, -1)} disabled={index === 0} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" onClick={() => moveStep(index, 1)} disabled={index === steps.length - 1} className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                  <ArrowDown className="size-3.5" />
                </button>
                <button type="button" onClick={() => removeStep(index)} className="rounded p-1 text-destructive hover:bg-destructive/10">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addStep} className="w-fit">
          <Plus className="size-3.5" /> Add step
        </Button>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button size="sm" onClick={handleSave} disabled={pending || steps.length === 0}>
          {pending ? "Saving…" : "Save sequence"}
        </Button>
      </CardContent>
    </Card>
  );
}
