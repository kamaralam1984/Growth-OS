"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { deleteWorkflowStepAction, connectWorkflowStepsAction } from "../../actions";
import type { WorkflowNodeTypeInput } from "@/lib/validations/workflows";
import type { Prisma } from "@/generated/prisma/client";

export interface StepDisplay {
  id: string;
  nodeType: WorkflowNodeTypeInput;
  name: string;
  config: Prisma.JsonValue;
  nextStepId: string | null;
  onTrueStepId: string | null;
  onFalseStepId: string | null;
}

const NOT_CONNECTED = "__none__";

function StepPointerSelect({
  label,
  value,
  steps,
  excludeId,
  onChange,
}: {
  label: string;
  value: string | null;
  steps: Array<{ id: string; name: string }>;
  excludeId: string;
  onChange: (stepId: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      {label}
      <Select
        className="h-8 w-auto text-xs"
        value={value ?? NOT_CONNECTED}
        onChange={(e) => {
          if (e.target.value !== NOT_CONNECTED) onChange(e.target.value);
        }}
      >
        <option value={NOT_CONNECTED}>— not connected —</option>
        {steps
          .filter((s) => s.id !== excludeId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
      </Select>
    </label>
  );
}

export function StepList({ steps, canManage }: { steps: StepDisplay[]; canManage: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const stepRefs = steps.map((s) => ({ id: s.id, name: s.name }));

  if (steps.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No steps yet. Add the first step below — a TRIGGER node is usually the right place to start.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {steps.map((step) => (
        <Card key={step.id} glass>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{step.nodeType}</Badge>
                <p className="font-medium text-foreground">{step.name}</p>
              </div>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!confirm(`Delete step "${step.name}"?`)) return;
                    startTransition(async () => {
                      await deleteWorkflowStepAction(step.id);
                      router.refresh();
                    });
                  }}
                  aria-label="Delete step"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>

            <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              {JSON.stringify(step.config, null, 2)}
            </pre>

            {canManage && (
              <div className="flex flex-wrap items-center gap-4">
                {step.nodeType === "CONDITION" ? (
                  <>
                    <StepPointerSelect
                      label="On true →"
                      value={step.onTrueStepId}
                      steps={stepRefs}
                      excludeId={step.id}
                      onChange={(toStepId) =>
                        startTransition(async () => {
                          await connectWorkflowStepsAction(step.id, toStepId, "true");
                          router.refresh();
                        })
                      }
                    />
                    <StepPointerSelect
                      label="On false →"
                      value={step.onFalseStepId}
                      steps={stepRefs}
                      excludeId={step.id}
                      onChange={(toStepId) =>
                        startTransition(async () => {
                          await connectWorkflowStepsAction(step.id, toStepId, "false");
                          router.refresh();
                        })
                      }
                    />
                  </>
                ) : (
                  <StepPointerSelect
                    label="Next →"
                    value={step.nextStepId}
                    steps={stepRefs}
                    excludeId={step.id}
                    onChange={(toStepId) =>
                      startTransition(async () => {
                        await connectWorkflowStepsAction(step.id, toStepId);
                        router.refresh();
                      })
                    }
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
