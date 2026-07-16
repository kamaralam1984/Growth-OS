import { prisma } from "@/lib/prisma";
import { addWorkflowStep, connectWorkflowSteps, createWorkflow, deleteWorkflow } from "./crud";
import { NODE_CONFIG_SCHEMAS } from "@/lib/validations/workflow-node-configs";
import { ensureAutomationTemplatesSeeded } from "./template-catalog";
import type { AutomationTemplate, WorkflowNodeType } from "@/generated/prisma/client";

export interface TemplateStepBlueprint {
  order: number;
  nodeType: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  onTrueOrder?: number;
  onFalseOrder?: number;
}

/** Real-parsed shape of AutomationTemplate.stepsBlueprint (Json column) — validated field-by-field below, never trusted blind. */
function parseBlueprint(raw: unknown): TemplateStepBlueprint[] {
  if (!Array.isArray(raw)) throw new Error("This template's stepsBlueprint is not an array — it can't be installed.");
  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) throw new Error(`Template step ${index} is not an object.`);
    const step = entry as Record<string, unknown>;
    if (typeof step.order !== "number") throw new Error(`Template step ${index} is missing a numeric "order".`);
    if (typeof step.nodeType !== "string") throw new Error(`Template step ${index} is missing a string "nodeType".`);
    if (typeof step.name !== "string") throw new Error(`Template step ${index} is missing a string "name".`);
    const position = step.position as { x?: unknown; y?: unknown } | undefined;
    return {
      order: step.order,
      nodeType: step.nodeType as WorkflowNodeType,
      name: step.name,
      config: (step.config as Record<string, unknown> | undefined) ?? {},
      position: { x: typeof position?.x === "number" ? position.x : 0, y: typeof position?.y === "number" ? position.y : 0 },
      onTrueOrder: typeof step.onTrueOrder === "number" ? step.onTrueOrder : undefined,
      onFalseOrder: typeof step.onFalseOrder === "number" ? step.onFalseOrder : undefined,
    };
  });
}

const STEPS_PLACEHOLDER_PATTERN = /\{\{\s*steps\.(\d+)\.([\w.]+)\s*\}\}/g;

/**
 * Rewrites this template layer's own `{{steps.N.field}}` convention into the
 * real `{{stepOutputs.<real step id>.field}}` placeholder AI_ACTION's
 * interpolateTemplate (ai-and-data.ts) actually resolves at run time — the
 * seed can't know a step's real id ahead of install, only its blueprint
 * `order`. Only string config values are rewritten (every use of this
 * convention in the seed data is inside a string `prompt` field); non-string
 * values pass through untouched.
 */
function rewriteStepsPlaceholders(config: Record<string, unknown>, orderToRealId: Map<number, string>): Record<string, unknown> {
  const rewritten: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== "string") {
      rewritten[key] = value;
      continue;
    }
    rewritten[key] = value.replace(STEPS_PLACEHOLDER_PATTERN, (match, orderStr: string, field: string) => {
      const realId = orderToRealId.get(Number(orderStr));
      if (!realId) return match; // leave unresolved rather than silently drop — install() rejects malformed forward-references before this ever runs
      return `{{stepOutputs.${realId}.${field}}}`;
    });
  }
  return rewritten;
}

/**
 * Installs an AutomationTemplate as a real Workflow + WorkflowStep graph —
 * always lands as status DRAFT (createWorkflow's schema default), same as
 * an AI-designed plan: a human must explicitly activate it before it can
 * run against real trigger events. Every step's config is re-validated
 * against NODE_CONFIG_SCHEMAS before creation (never trusts the stored
 * blueprint blindly), and `{{steps.N.field}}` references may only point
 * backward (an earlier order) — a forward/self reference is a malformed
 * template and is rejected outright rather than silently left unresolved.
 * Mirrors ai-designer-persist.ts's two-pass create-then-wire pattern and its
 * cleanup-on-failure discipline.
 */
export async function installTemplate(
  template: Pick<AutomationTemplate, "name" | "triggerType" | "triggerConfig" | "stepsBlueprint">,
  organizationId: string,
  createdByUserId: string,
): Promise<{ workflowId: string }> {
  const steps = parseBlueprint(template.stepsBlueprint).sort((a, b) => a.order - b.order);
  if (steps.length === 0) throw new Error("This template has no steps to install.");
  if (steps[0].nodeType !== "TRIGGER") throw new Error("This template's first step must be a TRIGGER node.");

  for (const step of steps) {
    const referencedOrders = [...step.config && typeof step.config.prompt === "string" ? step.config.prompt.matchAll(STEPS_PLACEHOLDER_PATTERN) : []].map(
      (m) => Number(m[1]),
    );
    for (const referenced of referencedOrders) {
      if (referenced >= step.order) {
        throw new Error(`Template step "${step.name}" (order ${step.order}) references steps.${referenced}, which is not an earlier step.`);
      }
    }
  }

  const workflow = await createWorkflow(organizationId, createdByUserId, {
    name: template.name,
    description: `Installed from the "${template.name}" template.`,
    triggerType: template.triggerType,
    triggerConfig: (template.triggerConfig as Record<string, unknown> | null) ?? undefined,
  });

  try {
    const orderToRealId = new Map<number, string>();

    for (const step of steps) {
      const configSchema = NODE_CONFIG_SCHEMAS[step.nodeType];
      const rewrittenConfig = rewriteStepsPlaceholders(step.config, orderToRealId);
      const parsedConfig = configSchema.safeParse(rewrittenConfig);
      if (!parsedConfig.success) {
        throw new Error(`Template step "${step.name}" has an invalid config: ${parsedConfig.error.issues[0]?.message ?? "unknown validation error"}.`);
      }

      const created = await addWorkflowStep(workflow.id, {
        workflowId: workflow.id,
        nodeType: step.nodeType,
        name: step.name,
        config: parsedConfig.data as Record<string, unknown>,
        position: step.position,
      });
      orderToRealId.set(step.order, created.id);
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const fromId = orderToRealId.get(step.order);
      if (!fromId) continue;

      const nextStep = steps[i + 1];
      const pointers: Array<{ order: number | undefined; branch?: "true" | "false" }> = [
        { order: step.nodeType === "CONDITION" ? undefined : nextStep?.order },
        { order: step.onTrueOrder, branch: "true" },
        { order: step.onFalseOrder, branch: "false" },
      ];

      for (const pointer of pointers) {
        if (pointer.order === undefined) continue;
        const toId = orderToRealId.get(pointer.order);
        if (!toId) throw new Error(`Template step "${step.name}" points at unknown order ${pointer.order}.`);
        await connectWorkflowSteps(fromId, toId, pointer.branch);
      }
    }

    return { workflowId: workflow.id };
  } catch (error) {
    await deleteWorkflow(workflow.id).catch(() => {});
    throw error;
  }
}

/** Lazily seeds the catalog on first real load (mirrors ensureMarketplaceCatalog's pattern) — no seed script to remember to run in a fresh environment. */
export async function listAutomationTemplates(): Promise<AutomationTemplate[]> {
  await ensureAutomationTemplatesSeeded();
  return prisma.automationTemplate.findMany({ orderBy: [{ popular: "desc" }, { name: "asc" }] });
}
