import { describe, expect, it } from "vitest";

import { CONTROL_FLOW_EXECUTORS } from "./control-flow";
import type { NodeExecutionContext } from "./types";

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

const CONDITION = CONTROL_FLOW_EXECUTORS.CONDITION;
if (!CONDITION) throw new Error("CONDITION executor is not registered on CONTROL_FLOW_EXECUTORS.");

describe("CONDITION node executor", () => {
  it("follows the 'true' branch when equals matches a real trigger payload field", async () => {
    const context = makeContext({ triggerPayload: { status: "won" } });
    const result = await CONDITION({ field: "status", operator: "equals", value: "won" }, context);
    expect(result.branch).toBe("true");
    expect(result.output).toEqual({ field: "status", operator: "equals", expected: "won", actual: "won", passed: true });
  });

  it("follows the 'false' branch when equals does not match", async () => {
    const context = makeContext({ triggerPayload: { status: "lost" } });
    const result = await CONDITION({ field: "status", operator: "equals", value: "won" }, context);
    expect(result.branch).toBe("false");
    expect(result.output?.passed).toBe(false);
  });

  it("reads a dotted path across nested trigger data", async () => {
    const context = makeContext({ triggerPayload: { deal: { amount: 5000 } } });
    const result = await CONDITION({ field: "deal.amount", operator: "greater_than", value: 1000 }, context);
    expect(result.branch).toBe("true");
    expect(result.output?.actual).toBe(5000);
  });

  it("resolves fields from a prior step's real output (stepOutputs), not just the trigger payload", async () => {
    const context = makeContext({ triggerPayload: {}, stepOutputs: { score: 42 } });
    const result = await CONDITION({ field: "score", operator: "greater_than", value: 10 }, context);
    expect(result.branch).toBe("true");
  });

  it("evaluates contains, less_than, exists, and not_exists correctly", async () => {
    const context = makeContext({ triggerPayload: { name: "Acme Corp", count: 3 } });

    expect((await CONDITION({ field: "name", operator: "contains", value: "Acme" }, context)).branch).toBe("true");
    expect((await CONDITION({ field: "count", operator: "less_than", value: 10 }, context)).branch).toBe("true");
    expect((await CONDITION({ field: "name", operator: "exists" }, context)).branch).toBe("true");
    expect((await CONDITION({ field: "missing", operator: "not_exists" }, context)).branch).toBe("true");
    expect((await CONDITION({ field: "missing", operator: "exists" }, context)).branch).toBe("false");
  });

  it("treats not_equals as the real negation of equals", async () => {
    const context = makeContext({ triggerPayload: { stage: "qualified" } });
    const result = await CONDITION({ field: "stage", operator: "not_equals", value: "closed" }, context);
    expect(result.branch).toBe("true");
  });

  it("throws a real Error for a missing/non-string field or operator", async () => {
    const context = makeContext();
    await expect(CONDITION({ operator: "equals", value: 1 }, context)).rejects.toThrow(/must include a string `field`/);
    await expect(CONDITION({ field: "x", value: 1 }, context)).rejects.toThrow(/must include a string `field`/);
  });

  it("throws a real Error for an unknown operator rather than silently failing closed/open", async () => {
    const context = makeContext({ triggerPayload: { x: 1 } });
    await expect(CONDITION({ field: "x", operator: "regex_match", value: "1" }, context)).rejects.toThrow(/Unknown CONDITION operator/);
  });

  it("never matches a comparison across mismatched types (e.g. string vs number for greater_than)", async () => {
    const context = makeContext({ triggerPayload: { amount: "not-a-number" } });
    const result = await CONDITION({ field: "amount", operator: "greater_than", value: 10 }, context);
    expect(result.branch).toBe("false");
  });
});
