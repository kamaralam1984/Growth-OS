"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, RefreshCw, Pencil, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { NODE_TYPE_META, type NodeTypeMeta } from "@/app/dashboard/automation/workflows/[id]/_lib/node-type-meta";
import { generateWorkflowPlanAction, createWorkflowFromPlanAction } from "../actions";
import type { WorkflowPlan, WorkflowPlanStep } from "@/lib/workflows/ai-designer";
import type { WorkflowNodeType } from "@/generated/prisma/client";

const EXAMPLE_PROMPTS = [
  "When a deal is won, create a project and email the client",
  "When a task becomes overdue, notify the assigned owner",
  "When a proposal is accepted, generate the contract document and request approval",
  "When a new lead is created, check its deal value and update the CRM stage if it's high value",
];

const ICON_COLOR_CLASSES: Record<NodeTypeMeta["color"], string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-500",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

function truncate(value: string, max = 60): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function formatConditionValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === undefined || value === null) return "";
  return String(value);
}

/** Genuinely reads each step's real generated config — mirrors the field names validated by NODE_CONFIG_SCHEMAS in src/lib/validations/workflow-node-configs.ts. */
function summarizeStepConfig(nodeType: WorkflowNodeType, config: Record<string, unknown>): string {
  switch (nodeType) {
    case "TRIGGER":
      return "Starts the workflow";
    case "CONDITION":
      return `if ${String(config.field ?? "field")} ${String(config.operator ?? "equals")} ${formatConditionValue(config.value)}`;
    case "DELAY":
      if (config.seconds) return `wait ${String(config.seconds)}s`;
      if (config.until) return `wait until ${String(config.until)}`;
      return "wait";
    case "LOOP":
      return `for each item in ${String(config.sourcePath ?? "")}`;
    case "AI_ACTION":
      return config.personaType
        ? `ask ${String(config.personaType)}: ${truncate(String(config.prompt ?? ""))}`
        : `prompt: ${truncate(String(config.prompt ?? ""))}`;
    case "EMAIL":
      return `to: ${String(config.to ?? "")} — "${String(config.subject ?? "")}"`;
    case "SMS":
      return "requires a Twilio connection (not yet available)";
    case "WEBHOOK":
      return `${String(config.method ?? "POST")} ${String(config.url ?? "")}`;
    case "CRM":
      if (config.action === "create_deal") return `create deal "${String(config.name ?? "")}"`;
      if (config.action === "update_deal_stage") return "update the deal's pipeline stage";
      if (config.action === "create_contact") return `create contact "${String(config.firstName ?? "")} ${String(config.lastName ?? "")}"`.trim();
      return "CRM action";
    case "PROPOSAL":
      return `generate proposal "${String(config.title ?? "")}"`;
    case "PROJECT":
      return config.dealId ? "create a project from the won deal" : `create project "${String(config.name ?? "")}"`;
    case "APPROVAL":
      return `require approval on the ${String(config.docKind ?? "document").toLowerCase()}`;
    case "DOCUMENT":
      return `render the ${String(config.kind ?? "document").toLowerCase()} as ${String(config.format ?? "pdf")}`;
    case "NOTIFICATION":
      return `notify: "${String(config.title ?? "")}"`;
    case "DATABASE":
      return `${String(config.operation ?? "findMany")} ${String(config.model ?? "")}`;
    case "FUNCTION":
      return `call ${String(config.functionName ?? "")}`;
    case "CUSTOM_API":
      return `${String(config.method ?? "POST")} ${String(config.url ?? "")}`;
    default:
      return "";
  }
}

interface AiWorkflowDesignerDialogProps {
  className?: string;
}

export function AiWorkflowDesignerDialog({ className }: AiWorkflowDesignerDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"form" | "preview">("form");

  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState<WorkflowPlan | null>(null);

  const [genPending, startGenTransition] = useTransition();
  const [genError, setGenError] = useState<string | null>(null);
  const [genErrorKind, setGenErrorKind] = useState<AIErrorKind>(undefined);

  const [createPending, startCreateTransition] = useTransition();
  const [createError, setCreateError] = useState<string | null>(null);

  function resetAll() {
    setStage("form");
    setPrompt("");
    setPlan(null);
    setGenError(null);
    setGenErrorKind(undefined);
    setCreateError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetAll();
  }

  function runGenerate(promptText: string) {
    setGenError(null);
    setGenErrorKind(undefined);
    startGenTransition(async () => {
      const result = await generateWorkflowPlanAction(promptText);
      if (!result.ok || !result.plan) {
        setGenError(result.error ?? "Something went wrong generating the workflow.");
        setGenErrorKind(result.errorKind);
        return;
      }
      setPlan(result.plan);
      setCreateError(null);
      setStage("preview");
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 10 || genPending) return;
    runGenerate(prompt);
  }

  function handleRegenerate() {
    if (prompt.trim().length < 10 || genPending) return;
    runGenerate(prompt);
  }

  function handleEditPrompt() {
    setGenError(null);
    setGenErrorKind(undefined);
    setStage("form");
  }

  function handleCreate() {
    if (!plan || createPending) return;
    setCreateError(null);
    startCreateTransition(async () => {
      const result = await createWorkflowFromPlanAction(plan);
      if (!result.ok || !result.workflowId) {
        setCreateError(result.error ?? "Something went wrong creating the workflow. Please try again.");
        return;
      }
      toast.success("Workflow created.", { description: plan.name });
      setOpen(false);
      resetAll();
      router.push(`/dashboard/automation/workflows/${result.workflowId}`);
    });
  }

  function stepLabelFor(tempId: string | undefined): string | null {
    if (!tempId || !plan) return null;
    return plan.steps.find((s) => s.tempId === tempId)?.name ?? null;
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className={className}>
          <Sparkles className="size-4" />
          Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn("max-w-2xl", className)}
        onInteractOutside={(e) => {
          if (genPending || createPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Generate a workflow with AI</DialogTitle>
          <DialogDescription>
            Describe what you want to happen in plain English — Claude designs a real, editable workflow you can review before creating it.
          </DialogDescription>
        </DialogHeader>

        {stage === "form" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="When a deal is won, create a project and email the client…"
                className="w-full resize-none rounded-lg border border-input bg-transparent px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={genPending}
                required
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    disabled={genPending}
                    className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors duration-150 ease-[var(--ease-out-quad)] hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {genPending && (
              <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm text-primary">
                <Loader2 className="size-4 shrink-0 animate-spin" />
                Designing your workflow with Claude — this can take a few seconds…
              </div>
            )}

            {!genPending && genError && <AiErrorBanner error={genError} kind={genErrorKind} />}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={genPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={genPending || prompt.trim().length < 10}>
                {genPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Designing…
                  </>
                ) : genError ? (
                  "Try again"
                ) : (
                  "Generate workflow"
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          plan && (
            <div className="flex flex-col gap-4">
              {genPending ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-sm text-primary">
                  <Loader2 className="size-4 shrink-0 animate-spin" />
                  Regenerating your workflow…
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                    <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
                    <span className="mt-2 inline-flex w-fit items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Trigger: {plan.triggerType.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>

                  {genError && <AiErrorBanner error={genError} kind={genErrorKind} />}

                  <ol className="flex flex-col gap-2.5">
                    {plan.steps.map((step: WorkflowPlanStep, index: number) => {
                      const meta = NODE_TYPE_META[step.nodeType];
                      const Icon = meta.icon;
                      return (
                        <li key={step.tempId} className="flex gap-3 rounded-xl border border-border bg-card/50 p-3">
                          <span
                            className={cn(
                              "flex size-8 shrink-0 items-center justify-center rounded-lg border",
                              ICON_COLOR_CLASSES[meta.color],
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                {index + 1}. {meta.label}
                              </span>
                              <span className="truncate text-sm font-medium text-foreground">{step.name}</span>
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{summarizeStepConfig(step.nodeType, step.config)}</p>
                            {step.nodeType === "CONDITION" && (
                              <div className="mt-1 flex flex-col gap-1 border-l-2 border-border pl-3 text-xs">
                                <span className="text-emerald-500">if true → {stepLabelFor(step.onTrue) ?? "end"}</span>
                                <span className="text-rose-500">if false → {stepLabelFor(step.onFalse) ?? "end"}</span>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </>
              )}

              {createError && <p className="text-sm text-destructive">{createError}</p>}

              <DialogFooter className="sm:justify-between">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleEditPrompt} disabled={genPending || createPending}>
                    <Pencil className="size-4" />
                    Edit prompt
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleRegenerate} disabled={genPending || createPending}>
                    <RefreshCw className={cn("size-4", genPending && "animate-spin")} />
                    Regenerate
                  </Button>
                </div>
                <Button type="button" onClick={handleCreate} disabled={genPending || createPending}>
                  {createPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      Create workflow
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
