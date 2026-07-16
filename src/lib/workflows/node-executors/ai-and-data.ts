import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { generateStructured, generateText } from "@/lib/ai/fallback";
import { getPersona, type ExecutiveAgentType } from "@/lib/ai/personas";
import { computeLeadScore } from "@/lib/lead-scoring";
import { computeCompanyHealth, computePipelineTotals } from "@/lib/company-health";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import type { NodeExecutionContext, NodeExecutorMap } from "./types";

/** Reads a dotted path ("a.b.c") off a plain object — mirrors control-flow.ts's readPath helper (not exported there, so duplicated here for the same real, eval-free lookup). Returns undefined on any missing segment. */
function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

const TEMPLATE_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Real {{dotted.path}} template substitution against a run's actual trigger/step data — no eval, no fake pass-through. Unresolved/missing paths render as "" rather than leaving the raw placeholder in the prompt. */
function interpolateTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(TEMPLATE_PATTERN, (_match, path: string) => {
    const value = readPath(data, path);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

/** True only when `type` is a real key PERSONAS actually defines (checked via the exported getPersona, since PERSONAS itself isn't exported). */
function isKnownPersonaType(type: string): type is ExecutiveAgentType {
  return getPersona(type as ExecutiveAgentType) !== undefined;
}

const OUTPUT_FIELD_TYPES = { string: z.string(), number: z.number(), boolean: z.boolean() } as const;

/**
 * Internal functions a FUNCTION node is allowed to call — a real, explicit
 * whitelist, NOT an eval()/dynamic-import-by-string dispatch. A Workflow's
 * config is user-authored data, never code, so the set of callable behavior
 * must be fixed at build time; anything not listed here is rejected in the
 * executor below rather than resolved dynamically.
 */
type InternalFunction = (args: Record<string, unknown>, context: NodeExecutionContext) => Promise<Record<string, unknown>>;

const FUNCTION_REGISTRY: Record<string, InternalFunction> = {
  // Real lead-scoring pass over one real Company (org-scoped), persisting the
  // same LeadScore row src/lib/lead-scoring.ts's scoreCompany() writes —
  // reimplemented here (not calling scoreCompany itself) because that helper
  // swallows its own errors, which would silently fake success for a node
  // executor that must throw honestly on failure.
  scoreLeadNow: async (args, context) => {
    const companyId = args.companyId;
    if (typeof companyId !== "string" || !companyId) {
      throw new Error('scoreLeadNow requires a string "companyId" argument.');
    }
    const company = await prisma.company.findFirst({ where: { id: companyId, organizationId: context.organizationId }, select: { id: true } });
    if (!company) throw new Error(`scoreLeadNow: no company "${companyId}" found in this organization.`);

    const score = await computeLeadScore(companyId);
    await prisma.leadScore.upsert({
      where: { companyId },
      create: { companyId, ...score, scoredAt: new Date() },
      update: { ...score, scoredAt: new Date() },
    });
    return { ...score };
  },

  computeCompanyHealth: async (_args, context) => {
    const health = await computeCompanyHealth(context.organizationId);
    return { ...health };
  },

  computePipelineTotals: async (_args, context) => {
    const totals = await computePipelineTotals(context.organizationId);
    return { ...totals };
  },

  formatCurrency: async (args) => {
    const value = args.value;
    if (typeof value !== "number") throw new Error('formatCurrency requires a numeric "value" argument.');
    const currencyCode = typeof args.currencyCode === "string" ? args.currencyCode : undefined;
    return { formatted: formatCurrency(value, currencyCode) };
  },
};

// Security whitelist for DATABASE nodes — a small, explicit set of models a
// workflow's config is ever allowed to query, never the full Prisma client
// surface, and never User/Membership/Account/Session/Secret/ApiKey or any
// other auth- or credential-adjacent model. "lead" is deliberately excluded:
// Lead has no direct organizationId column (only via
// pipelineStage.workspace.organizationId), so it cannot be safely org-scoped
// by the flat `where.organizationId` override this executor forces below.
const QUERYABLE_MODELS = new Set(["deal", "contact", "task", "company", "project"]);

// Only real READ operations — no create/update/delete/deleteMany through
// this generic, config-driven node. Mutating a record belongs to the
// purpose-built CRM/PROJECT/DOCUMENT/etc. node types, never a generic
// passthrough that a workflow's stored JSON config could aim at any table.
const QUERYABLE_OPERATIONS = new Set(["findMany", "findFirst", "count"]);

interface QueryableDelegate {
  findMany: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args: Record<string, unknown>) => Promise<unknown>;
}

export const AI_AND_DATA_EXECUTORS: NodeExecutorMap = {
  // config: { prompt: string, personaType?: string, outputSchema?: Record<string, "string"|"number"|"boolean"> }
  // `prompt` supports real {{dotted.path}} interpolation against the run's
  // trigger payload and prior step outputs (e.g. "{{stepOutputs.step1.dealId}}").
  AI_ACTION: async (config, context) => {
    if (!isAIConnected()) throw new AINotConnectedError();

    const promptTemplate = config.prompt;
    if (typeof promptTemplate !== "string" || !promptTemplate.trim()) {
      throw new Error('AI_ACTION node config must include a non-empty string "prompt".');
    }

    const searchSpace = { ...context.triggerPayload, stepOutputs: context.stepOutputs };
    const prompt = interpolateTemplate(promptTemplate, searchSpace);

    const personaType = typeof config.personaType === "string" ? config.personaType : undefined;
    const persona = personaType && isKnownPersonaType(personaType) ? getPersona(personaType) : undefined;
    const system = persona
      ? `${persona.systemPrompt}\n\nYou are executing one automated step of a real Workflow — respond directly to the task below, no meeting/board framing.`
      : "You are an AI automation step inside KVL GrowthOS, executing one real Workflow action. Respond directly and concisely to the task given.";

    const outputSchemaConfig = config.outputSchema as Record<string, "string" | "number" | "boolean"> | undefined;

    if (outputSchemaConfig && Object.keys(outputSchemaConfig).length > 0) {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [field, fieldType] of Object.entries(outputSchemaConfig)) {
        const zodType = OUTPUT_FIELD_TYPES[fieldType];
        if (!zodType) throw new Error(`AI_ACTION node's outputSchema field "${field}" has unsupported type "${fieldType}". Valid: string, number, boolean.`);
        shape[field] = zodType;
      }

      const result = await generateStructured({
        system,
        userContent: prompt,
        maxTokens: 2048,
        effort: "medium",
        schema: z.object(shape),
      });

      return { output: { text: JSON.stringify(result.parsed), ...result.parsed } };
    }

    const result = await generateText({ system, userContent: prompt, maxTokens: 2048 });
    return { output: { text: result.text } };
  },

  // config: { functionName: string, args?: Record<string, unknown> }
  FUNCTION: async (config, context) => {
    const functionName = config.functionName;
    if (typeof functionName !== "string" || !functionName) {
      throw new Error('FUNCTION node config must include a string "functionName".');
    }
    const fn = FUNCTION_REGISTRY[functionName];
    if (!fn) {
      throw new Error(`Unknown function "${functionName}". FUNCTION nodes may only call whitelisted internal functions: ${Object.keys(FUNCTION_REGISTRY).join(", ")}.`);
    }
    const args = (config.args as Record<string, unknown> | undefined) ?? {};
    const output = await fn(args, context);
    return { output };
  },

  // config: { model: string, operation: "findMany" | "findFirst" | "count", where?: Record<string, unknown>, select?: Record<string, boolean> }
  // Safety, enforced here rather than trusted to the caller: (1) QUERYABLE_MODELS
  // is a small explicit whitelist, never the full Prisma client surface, and
  // never an auth/secret-adjacent model; (2) only findMany/findFirst/count are
  // reachable — real reads only, no create/update/delete/deleteMany; (3)
  // config.where is spread FIRST and organizationId is forced LAST, so a
  // workflow-authored where clause can never override it and cross a tenant
  // boundary; (4) any model not in the whitelist is rejected outright.
  DATABASE: async (config, context) => {
    const model = config.model;
    if (typeof model !== "string" || !QUERYABLE_MODELS.has(model)) {
      throw new Error(`DATABASE node's model "${String(model)}" is not queryable. Allowed: ${Array.from(QUERYABLE_MODELS).join(", ")}.`);
    }

    const operation = config.operation;
    if (typeof operation !== "string" || !QUERYABLE_OPERATIONS.has(operation)) {
      throw new Error(`DATABASE node's operation "${String(operation)}" is not supported. Allowed (read-only): ${Array.from(QUERYABLE_OPERATIONS).join(", ")}.`);
    }

    const configWhere = (config.where as Record<string, unknown> | undefined) ?? {};
    const where = { ...configWhere, organizationId: context.organizationId };
    const select = config.select as Record<string, boolean> | undefined;

    const queryArgs: Record<string, unknown> = { where };
    if (select && operation !== "count") queryArgs.select = select;

    const delegate = (prisma as unknown as Record<string, QueryableDelegate>)[model];
    const result = await delegate[operation as "findMany" | "findFirst" | "count"](queryArgs);

    return { output: { model, operation, result } };
  },
};
