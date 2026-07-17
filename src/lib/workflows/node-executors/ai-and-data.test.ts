import { beforeEach, describe, expect, it, vi } from "vitest";

import { AI_AND_DATA_EXECUTORS } from "./ai-and-data";
import type { NodeExecutionContext } from "./types";

const isAIConnected = vi.fn();
vi.mock("@/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/client")>();
  return { ...actual, isAIConnected: (...a: unknown[]) => isAIConnected(...(a as [])) };
});

const generateText = vi.fn();
const generateStructured = vi.fn();
vi.mock("@/lib/ai/fallback", () => ({
  generateText: (...a: unknown[]) => generateText(...a),
  generateStructured: (...a: unknown[]) => generateStructured(...a),
}));

const companyFindFirst = vi.fn();
const leadScoreUpsert = vi.fn();
const dealFindMany = vi.fn();
const dealFindFirst = vi.fn();
const dealCount = vi.fn();
const contactFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    company: { findFirst: (...a: unknown[]) => companyFindFirst(...a) },
    leadScore: { upsert: (...a: unknown[]) => leadScoreUpsert(...a) },
    deal: { findMany: (...a: unknown[]) => dealFindMany(...a), findFirst: (...a: unknown[]) => dealFindFirst(...a), count: (...a: unknown[]) => dealCount(...a) },
    contact: { findMany: (...a: unknown[]) => contactFindMany(...a) },
  },
}));

const computeLeadScore = vi.fn();
vi.mock("@/lib/lead-scoring", () => ({
  computeLeadScore: (...a: unknown[]) => computeLeadScore(...a),
}));

const computeCompanyHealth = vi.fn();
const computePipelineTotals = vi.fn();
vi.mock("@/lib/company-health", () => ({
  computeCompanyHealth: (...a: unknown[]) => computeCompanyHealth(...a),
  computePipelineTotals: (...a: unknown[]) => computePipelineTotals(...a),
}));

function makeContext(overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return {
    organizationId: "org_1",
    workflowRunId: "run_1",
    workflowStepId: "step_1",
    triggerPayload: {},
    stepOutputs: {},
    ...overrides,
  };
}

const AI_ACTION = AI_AND_DATA_EXECUTORS.AI_ACTION;
const FUNCTION = AI_AND_DATA_EXECUTORS.FUNCTION;
const DATABASE = AI_AND_DATA_EXECUTORS.DATABASE;
if (!AI_ACTION || !FUNCTION || !DATABASE) {
  throw new Error("One or more AI_AND_DATA_EXECUTORS entries are not registered.");
}

beforeEach(() => {
  vi.clearAllMocks();
  isAIConnected.mockReturnValue(true);
});

describe("AI_ACTION node executor", () => {
  it("throws AINotConnectedError when AI isn't connected for this deployment", async () => {
    isAIConnected.mockReturnValue(false);
    await expect(AI_ACTION({ prompt: "hello" }, makeContext())).rejects.toThrow("AI_NOT_CONNECTED");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("throws for a missing/blank prompt", async () => {
    await expect(AI_ACTION({}, makeContext())).rejects.toThrow(/non-empty string "prompt"/);
    await expect(AI_ACTION({ prompt: "   " }, makeContext())).rejects.toThrow(/non-empty string "prompt"/);
  });

  it("interpolates a {{field}} placeholder from the real trigger payload", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "Hello {{name}}, you are from {{company}}" }, makeContext({ triggerPayload: { name: "Bob", company: "Acme" } }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: "Hello Bob, you are from Acme" }));
  });

  it("interpolates a nested {{a.b.c}} dotted-path placeholder", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "Deal amount: {{deal.amount}}" }, makeContext({ triggerPayload: { deal: { amount: 500 } } }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: "Deal amount: 500" }));
  });

  it("interpolates a {{stepOutputs.stepId.field}} placeholder from a prior step's real output", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "Prior dealId: {{stepOutputs.step1.dealId}}" }, makeContext({ stepOutputs: { step1: { dealId: "deal_42" } } }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: "Prior dealId: deal_42" }));
  });

  it("renders a missing/unresolved placeholder path as an empty string, never leaving the raw braces in", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "Value: [{{nothing.here}}]" }, makeContext());
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: "Value: []" }));
  });

  it("JSON-stringifies a non-string interpolated value (object/array/number)", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "Payload: {{payload}}" }, makeContext({ triggerPayload: { payload: { a: 1, b: [2, 3] } } }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: `Payload: ${JSON.stringify({ a: 1, b: [2, 3] })}` }));
  });

  it("leaves plain text with no {{...}} placeholders completely untouched", async () => {
    generateText.mockResolvedValue({ text: "reply" });
    await AI_ACTION({ prompt: "No placeholders here." }, makeContext());
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ userContent: "No placeholders here." }));
  });

  it("returns the model's real text output when no outputSchema is configured", async () => {
    generateText.mockResolvedValue({ text: "the real answer" });
    const result = await AI_ACTION({ prompt: "hi" }, makeContext());
    expect(result).toEqual({ output: { text: "the real answer" } });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("uses a real, known persona's system prompt when personaType matches an actual persona", async () => {
    generateText.mockResolvedValue({ text: "ok" });
    await AI_ACTION({ prompt: "hi", personaType: "CEO" }, makeContext());
    const call = generateText.mock.calls[0][0] as { system: string };
    expect(call.system).toMatch(/executing one automated step of a real Workflow/);
    expect(call.system.length).toBeGreaterThan(50);
  });

  it("falls back to the generic system prompt for an unrecognized personaType", async () => {
    generateText.mockResolvedValue({ text: "ok" });
    await AI_ACTION({ prompt: "hi", personaType: "NOT_A_REAL_PERSONA" }, makeContext());
    const call = generateText.mock.calls[0][0] as { system: string };
    expect(call.system).toBe("You are an AI automation step inside KVL GrowthOS, executing one real Workflow action. Respond directly and concisely to the task given.");
  });

  it("calls generateStructured with a zod schema built from outputSchema and merges the parsed fields into output", async () => {
    generateStructured.mockResolvedValue({ parsed: { score: 7, isQualified: true } });
    const result = await AI_ACTION({ prompt: "score this lead", outputSchema: { score: "number", isQualified: "boolean" } }, makeContext());

    expect(generateStructured).toHaveBeenCalled();
    const call = generateStructured.mock.calls[0][0] as { schema: { safeParse: (v: unknown) => { success: boolean } } };
    expect(call.schema.safeParse({ score: 1, isQualified: false }).success).toBe(true);
    expect(call.schema.safeParse({ score: "not a number", isQualified: false }).success).toBe(false);

    expect(result).toEqual({ output: { text: JSON.stringify({ score: 7, isQualified: true }), score: 7, isQualified: true } });
  });

  it("throws for an outputSchema field with an unsupported type, without calling generateStructured", async () => {
    await expect(AI_ACTION({ prompt: "hi", outputSchema: { foo: "array" } }, makeContext())).rejects.toThrow(/unsupported type "array"/);
    expect(generateStructured).not.toHaveBeenCalled();
  });
});

describe("FUNCTION node executor", () => {
  it("throws for a missing/blank functionName", async () => {
    await expect(FUNCTION({}, makeContext())).rejects.toThrow(/must include a string "functionName"/);
  });

  it("throws for a functionName not on the internal whitelist, listing what IS allowed", async () => {
    await expect(FUNCTION({ functionName: "deleteEverything" }, makeContext())).rejects.toThrow(/Unknown function "deleteEverything"[\s\S]*whitelisted internal functions/);
  });

  it("computes formatCurrency using the real formatting function (no mocking needed)", async () => {
    const result = await FUNCTION({ functionName: "formatCurrency", args: { value: 1234, currencyCode: "USD" } }, makeContext());
    expect(result.output?.formatted).toContain("1,234");
  });

  it("throws from formatCurrency when 'value' isn't numeric", async () => {
    await expect(FUNCTION({ functionName: "formatCurrency", args: { value: "not a number" } }, makeContext())).rejects.toThrow(/requires a numeric "value"/);
  });

  it("scoreLeadNow throws for a missing companyId argument, before any DB call", async () => {
    await expect(FUNCTION({ functionName: "scoreLeadNow", args: {} }, makeContext())).rejects.toThrow(/requires a string "companyId"/);
    expect(companyFindFirst).not.toHaveBeenCalled();
  });

  it("scoreLeadNow throws when the company doesn't exist in this organization", async () => {
    companyFindFirst.mockResolvedValue(null);
    await expect(FUNCTION({ functionName: "scoreLeadNow", args: { companyId: "co_1" } }, makeContext())).rejects.toThrow(/no company "co_1" found in this organization/);
    expect(companyFindFirst).toHaveBeenCalledWith({ where: { id: "co_1", organizationId: "org_1" }, select: { id: true } });
    expect(computeLeadScore).not.toHaveBeenCalled();
  });

  it("scoreLeadNow persists a real LeadScore upsert and returns the computed score", async () => {
    companyFindFirst.mockResolvedValue({ id: "co_1" });
    computeLeadScore.mockResolvedValue({ score: 88, tier: "HOT" });

    const result = await FUNCTION({ functionName: "scoreLeadNow", args: { companyId: "co_1" } }, makeContext());

    expect(leadScoreUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "co_1" },
        create: expect.objectContaining({ companyId: "co_1", score: 88, tier: "HOT" }),
        update: expect.objectContaining({ score: 88, tier: "HOT" }),
      }),
    );
    expect(result).toEqual({ output: { score: 88, tier: "HOT" } });
  });

  it("computeCompanyHealth and computePipelineTotals are scoped to the run's real organizationId", async () => {
    computeCompanyHealth.mockResolvedValue({ healthy: 3 });
    computePipelineTotals.mockResolvedValue({ total: 9000 });

    await FUNCTION({ functionName: "computeCompanyHealth" }, makeContext({ organizationId: "org_zeta" }));
    expect(computeCompanyHealth).toHaveBeenCalledWith("org_zeta");

    await FUNCTION({ functionName: "computePipelineTotals" }, makeContext({ organizationId: "org_zeta" }));
    expect(computePipelineTotals).toHaveBeenCalledWith("org_zeta");
  });
});

describe("DATABASE node executor", () => {
  it("rejects a model that isn't on the small read whitelist", async () => {
    await expect(DATABASE({ model: "user", operation: "findMany" }, makeContext())).rejects.toThrow(/model "user" is not queryable/);
  });

  it("rejects an operation that isn't a real read (e.g. a mutation)", async () => {
    await expect(DATABASE({ model: "deal", operation: "deleteMany" }, makeContext())).rejects.toThrow(/operation "deleteMany" is not supported/);
    expect(dealFindMany).not.toHaveBeenCalled();
  });

  it("forces organizationId onto the query even when the workflow-authored where clause tries to override it — real tenant-isolation guarantee", async () => {
    dealFindMany.mockResolvedValue([{ id: "d1" }]);
    await DATABASE({ model: "deal", operation: "findMany", where: { organizationId: "org_ATTACKER", stage: "won" } }, makeContext({ organizationId: "org_real" }));

    expect(dealFindMany).toHaveBeenCalledWith({ where: { organizationId: "org_real", stage: "won" } });
  });

  it("passes through a real select clause for findMany/findFirst but omits it for count", async () => {
    dealFindMany.mockResolvedValue([]);
    await DATABASE({ model: "deal", operation: "findMany", select: { id: true, name: true } }, makeContext());
    expect(dealFindMany).toHaveBeenCalledWith({ where: { organizationId: "org_1" }, select: { id: true, name: true } });

    dealCount.mockResolvedValue(5);
    await DATABASE({ model: "deal", operation: "count", select: { id: true } }, makeContext());
    expect(dealCount).toHaveBeenCalledWith({ where: { organizationId: "org_1" } });
  });

  it("returns the real model/operation/result triple", async () => {
    contactFindMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    const result = await DATABASE({ model: "contact", operation: "findMany" }, makeContext());
    expect(result).toEqual({ output: { model: "contact", operation: "findMany", result: [{ id: "c1" }, { id: "c2" }] } });
  });
});
