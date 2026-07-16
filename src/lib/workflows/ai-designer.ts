import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

import {
  AGENT_MODEL,
  AIBillingError,
  AINotConnectedError,
  getAnthropicClient,
  isAIBillingError,
  isAIConnected,
} from "@/lib/ai/client";
import { NODE_CONFIG_SCHEMAS } from "@/lib/validations/workflow-node-configs";
import { workflowNodeTypeSchema, workflowTriggerTypeSchema } from "@/lib/validations/workflows";
import { ALL_NODE_TYPES, NODE_TYPE_META } from "@/app/dashboard/automation/workflows/[id]/_lib/node-type-meta";
import type { AutomationTrigger, WorkflowNodeType } from "@/generated/prisma/client";

/**
 * The real AI generation engine for the AI Workflow Designer — a genuine
 * Claude tool-use call that turns a plain-English description into a
 * structured, validated Workflow DAG plan. This module only produces the
 * in-memory plan; persisting it into real WorkflowStep rows is a separate
 * concern (see addWorkflowStep in src/lib/workflows/crud.ts, which this
 * plan's step shape maps onto directly: tempId -> new step id, next/onTrue/
 * onFalse -> nextStepId/onTrueStepId/onFalseStepId once ids exist).
 */

export interface WorkflowPlanStep {
  /** A short local id like "1", "2" — NOT a database id. */
  tempId: string;
  nodeType: WorkflowNodeType;
  name: string;
  /** Validated against NODE_CONFIG_SCHEMAS[nodeType] before this plan is ever returned. */
  config: Record<string, unknown>;
  /** tempId of the next step. Omitted on a terminal step. */
  next?: string;
  /** tempId to follow when true. CONDITION only. */
  onTrue?: string;
  /** tempId to follow when false. CONDITION only. */
  onFalse?: string;
}

export interface WorkflowPlan {
  name: string;
  description: string;
  triggerType: AutomationTrigger;
  /** First step MUST be { nodeType: "TRIGGER", tempId: "1" }. */
  steps: WorkflowPlanStep[];
}

/** Thrown when the AI-generated plan is still invalid after one self-correction retry. Lists exactly which fields failed — never silently coerced. */
export class WorkflowPlanValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
    this.name = "WorkflowPlanValidationError";
  }
}

// Loose structural schema for the RAW tool call input — validates shape only
// (tempId/nodeType/name/config present, triggerType is a real enum value).
// Per-nodeType config correctness is checked separately below against
// NODE_CONFIG_SCHEMAS, and DAG wiring is checked by validatePlanStructure —
// keeping these as separate passes is what lets the retry prompt name
// exactly which of the three failed.
const rawWorkflowPlanStepSchema = z.object({
  tempId: z.string().trim().min(1),
  nodeType: workflowNodeTypeSchema,
  name: z.string().trim().min(1),
  config: z.record(z.string(), z.unknown()).default({}),
  next: z.string().trim().min(1).optional(),
  onTrue: z.string().trim().min(1).optional(),
  onFalse: z.string().trim().min(1).optional(),
});

const rawWorkflowPlanSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim(),
  triggerType: workflowTriggerTypeSchema,
  steps: z.array(rawWorkflowPlanStepSchema).min(1),
});

/** Hand-maintained one-line config shape hint per WorkflowNodeType, generated straight from NODE_CONFIG_SCHEMAS via zod's own toJSONSchema — never re-described from scratch, so it can't drift from the real validation schema. */
function buildConfigShapeHints(): Record<WorkflowNodeType, string> {
  const hints = {} as Record<WorkflowNodeType, string>;
  for (const nodeType of ALL_NODE_TYPES) {
    const schema = NODE_CONFIG_SCHEMAS[nodeType];
    try {
      hints[nodeType] = JSON.stringify(z.toJSONSchema(schema));
    } catch {
      hints[nodeType] = "{}";
    }
  }
  return hints;
}

function buildSystemPrompt(): string {
  const configShapeHints = buildConfigShapeHints();
  const nodeTypeDocs = ALL_NODE_TYPES.map((nodeType) => {
    const meta = NODE_TYPE_META[nodeType];
    return `- ${nodeType}: ${meta.description}\n  config JSON schema: ${configShapeHints[nodeType]}`;
  }).join("\n");
  const triggerList = workflowTriggerTypeSchema.options.join(", ");

  return [
    "You are the AI Workflow Designer inside KVL GrowthOS, a business automation platform. A user describes, in plain English, an automation they want. Turn that description into a complete, valid, executable Workflow DAG plan by calling the generate_workflow tool exactly once — never respond in plain text.",
    "",
    "## Valid WorkflowNodeType values — one node per DAG step — and their EXACT config shape",
    "Every step's `config` object MUST validate against the JSON schema shown for its nodeType. Do not invent fields that aren't in the schema, and do not omit required fields.",
    nodeTypeDocs,
    "",
    "## Valid AutomationTrigger values (plan.triggerType must be exactly one of these)",
    triggerList,
    "",
    "## DAG wiring rules — a plan that violates any of these is invalid",
    '- steps[0] MUST be { nodeType: "TRIGGER", tempId: "1" }, and no other step may be nodeType "TRIGGER".',
    "- Every tempId in the plan must be unique.",
    '- Every CONDITION step MUST set both "onTrue" and "onFalse" (never "next") — the tempId to run for each branch.',
    '- Every other non-terminal step MUST set "next" to the tempId that runs after it (never "onTrue"/"onFalse"). A step that omits "next" is a terminal step — the run ends there.',
    '- "next"/"onTrue"/"onFalse" must always point at a real tempId that exists elsewhere in plan.steps, and must never point at the same step\'s own tempId.',
    "",
    "## Other rules",
    '- SMS has no working provider yet and always fails at runtime — only use it if the user explicitly asks for SMS; prefer EMAIL or NOTIFICATION otherwise.',
    "- Ground every step in what the user actually asked for. Do not pad the plan with unrelated steps just to look more sophisticated.",
    "- Give each step a short, human-readable `name` describing what it does (e.g. \"Send welcome email\", not \"Step 3\").",
  ].join("\n");
}

const GENERATE_WORKFLOW_TOOL: Anthropic.Tool = {
  name: "generate_workflow",
  description:
    "Return the complete, structured workflow automation plan for the user's request — the workflow's name, description, trigger, and every DAG step with its exact config and wiring.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short, human-readable workflow name." },
      description: { type: "string", description: "One or two sentence summary of what this workflow does." },
      triggerType: {
        type: "string",
        enum: [...workflowTriggerTypeSchema.options],
        description: "The real event that starts this workflow.",
      },
      steps: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            tempId: { type: "string", description: 'A short local id like "1", "2" — not a database id.' },
            nodeType: { type: "string", enum: [...workflowNodeTypeSchema.options] },
            name: { type: "string", description: "Short, human-readable step name." },
            config: {
              type: "object",
              description: "Node-type-specific config — MUST match the JSON schema given for this step's nodeType in the system prompt.",
            },
            next: { type: "string", description: 'tempId of the next step. Omit on a terminal step. Never used on a CONDITION step.' },
            onTrue: { type: "string", description: "CONDITION steps only: tempId to run when the condition is true." },
            onFalse: { type: "string", description: "CONDITION steps only: tempId to run when the condition is false." },
          },
          required: ["tempId", "nodeType", "name", "config"],
        },
      },
    },
    required: ["name", "description", "triggerType", "steps"],
  },
};

function buildUserPrompt(prompt: string): string {
  return `Generate a workflow automation plan for this request:\n\n"${prompt}"\n\nCall the generate_workflow tool with the complete plan.`;
}

function buildRetryPrompt(prompt: string, rawInput: unknown, issues: string[]): string {
  return [
    `Generate a workflow automation plan for this request:\n\n"${prompt}"`,
    `Your previous generate_workflow call produced this plan:\n\n${JSON.stringify(rawInput, null, 2)}`,
    `That plan is INVALID. Fix exactly these problems and call generate_workflow again with the COMPLETE corrected plan (not just the fixed fields):\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
  ].join("\n\n");
}

async function callGenerateWorkflowTool(client: Anthropic, systemPrompt: string, userContent: string): Promise<unknown> {
  const response = await client.messages.create({
    model: AGENT_MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: systemPrompt,
    tools: [GENERATE_WORKFLOW_TOOL],
    tool_choice: { type: "tool", name: "generate_workflow" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "generate_workflow",
  );
  if (!toolUse) {
    throw new Error(`Claude did not return a generate_workflow tool call (stop_reason: ${response.stop_reason ?? "unknown"}).`);
  }
  return toolUse.input;
}

/** Validates config against NODE_CONFIG_SCHEMAS[step.nodeType] for every step — the real per-nodeType shape check, never silently coerced. */
function validateStepConfigs(steps: z.infer<typeof rawWorkflowPlanSchema>["steps"]): string[] {
  const issues: string[] = [];
  for (const step of steps) {
    const schema = NODE_CONFIG_SCHEMAS[step.nodeType];
    const result = schema.safeParse(step.config);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const fieldPath = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        issues.push(`step "${step.tempId}" (${step.nodeType}) config.${fieldPath}: ${issue.message}`);
      }
    }
  }
  return issues;
}

/** Validates DAG wiring: exactly one TRIGGER at tempId "1" as the first step, unique tempIds, no dangling next/onTrue/onFalse pointers, no self-references, and CONDITION-vs-other pointer field usage. */
function validatePlanStructure(plan: z.infer<typeof rawWorkflowPlanSchema>): string[] {
  const issues: string[] = [];
  const steps = plan.steps;

  const first = steps[0];
  if (first.nodeType !== "TRIGGER") {
    issues.push(`plan.steps[0]: the first step must be nodeType "TRIGGER", got "${first.nodeType}".`);
  }
  if (first.tempId !== "1") {
    issues.push(`plan.steps[0]: the first step's tempId must be "1", got "${first.tempId}".`);
  }

  const tempIdCounts = new Map<string, number>();
  steps.forEach((step, index) => {
    tempIdCounts.set(step.tempId, (tempIdCounts.get(step.tempId) ?? 0) + 1);
    if (index > 0 && step.nodeType === "TRIGGER") {
      issues.push(`step "${step.tempId}": only steps[0] may be nodeType "TRIGGER".`);
    }
  });
  for (const [tempId, count] of tempIdCounts) {
    if (count > 1) issues.push(`plan.steps: tempId "${tempId}" is used by ${count} steps — every tempId must be unique.`);
  }

  const validTempIds = new Set(steps.map((step) => step.tempId));

  for (const step of steps) {
    const pointers: Array<["next" | "onTrue" | "onFalse", string | undefined]> = [
      ["next", step.next],
      ["onTrue", step.onTrue],
      ["onFalse", step.onFalse],
    ];
    for (const [field, target] of pointers) {
      if (target === undefined) continue;
      if (target === step.tempId) {
        issues.push(`step "${step.tempId}": "${field}" points to itself.`);
        continue;
      }
      if (!validTempIds.has(target)) {
        issues.push(`step "${step.tempId}": "${field}" points to tempId "${target}", which does not exist in plan.steps.`);
      }
    }

    if (step.nodeType === "CONDITION") {
      if (step.next !== undefined) issues.push(`step "${step.tempId}" (CONDITION): must use "onTrue"/"onFalse", not "next".`);
      if (step.onTrue === undefined) issues.push(`step "${step.tempId}" (CONDITION): missing required "onTrue".`);
      if (step.onFalse === undefined) issues.push(`step "${step.tempId}" (CONDITION): missing required "onFalse".`);
    } else if (step.onTrue !== undefined || step.onFalse !== undefined) {
      issues.push(`step "${step.tempId}" (${step.nodeType}): "onTrue"/"onFalse" are only valid on CONDITION steps — use "next" instead.`);
    }
  }

  return issues;
}

/** Runs every validation pass against a raw tool-call input. Returns the typed plan (even when invalid, so a retry prompt can reference it) plus the full list of issues found. */
function parseAndValidate(rawInput: unknown): { plan: WorkflowPlan | null; issues: string[] } {
  const structural = rawWorkflowPlanSchema.safeParse(rawInput);
  if (!structural.success) {
    const issues = structural.error.issues.map((issue) => `plan.${issue.path.join(".") || "(root)"}: ${issue.message}`);
    return { plan: null, issues };
  }

  const issues = [...validateStepConfigs(structural.data.steps), ...validatePlanStructure(structural.data)];
  return { plan: structural.data as WorkflowPlan, issues };
}

/**
 * Real Claude tool-use call that turns a plain-English automation
 * description into a structured, validated WorkflowPlan. Runs a full
 * validation pass (per-nodeType config shape + DAG wiring) after the call;
 * on failure, does exactly ONE real retry with the validation errors
 * appended to the prompt so Claude can self-correct. If the plan is still
 * invalid after the retry, throws WorkflowPlanValidationError listing every
 * field that failed — this function never silently drops or guesses a
 * step's config to make an invalid plan "look" valid.
 */
export async function generateWorkflowPlan(prompt: string): Promise<WorkflowPlan> {
  if (!isAIConnected()) throw new AINotConnectedError();
  const client = getAnthropicClient();
  const systemPrompt = buildSystemPrompt();

  let rawInput: unknown;
  try {
    rawInput = await callGenerateWorkflowTool(client, systemPrompt, buildUserPrompt(prompt));
  } catch (error) {
    if (isAIBillingError(error)) throw new AIBillingError(error);
    throw error;
  }

  const first = parseAndValidate(rawInput);
  if (first.issues.length === 0 && first.plan) {
    return first.plan;
  }

  // One real retry: re-call Claude with the exact validation errors appended, asking it to fix only those.
  let retryRawInput: unknown;
  try {
    retryRawInput = await callGenerateWorkflowTool(client, systemPrompt, buildRetryPrompt(prompt, rawInput, first.issues));
  } catch (error) {
    if (isAIBillingError(error)) throw new AIBillingError(error);
    throw error;
  }

  const second = parseAndValidate(retryRawInput);
  if (second.issues.length === 0 && second.plan) {
    return second.plan;
  }

  throw new WorkflowPlanValidationError(
    `The AI-generated workflow plan failed validation after one retry:\n${second.issues.map((issue) => `- ${issue}`).join("\n")}`,
    second.issues,
  );
}
