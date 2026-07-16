import type { NodeExecutorMap } from "./types";

/** Reads a dotted path ("a.b.c") off a plain object — real lookup, no eval. Returns undefined on any missing segment. */
function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

const OPERATORS: Record<string, (a: unknown, b: unknown) => boolean> = {
  equals: (a, b) => a === b,
  not_equals: (a, b) => a !== b,
  contains: (a, b) => typeof a === "string" && typeof b === "string" && a.includes(b),
  greater_than: (a, b) => typeof a === "number" && typeof b === "number" && a > b,
  less_than: (a, b) => typeof a === "number" && typeof b === "number" && a < b,
  exists: (a) => a !== undefined && a !== null,
  not_exists: (a) => a === undefined || a === null,
};

export const CONTROL_FLOW_EXECUTORS: NodeExecutorMap = {
  // The engine consumes TRIGGER only to identify the run's entry point — it
  // never re-executes it as a node, but a real executor is registered anyway
  // so an accidental direct call never silently no-ops.
  TRIGGER: async (_config, context) => ({ output: { triggerPayload: context.triggerPayload } }),

  CONDITION: async (config, context) => {
    const field = config.field;
    const operator = config.operator;
    const value = config.value;
    if (typeof field !== "string" || typeof operator !== "string") {
      throw new Error("CONDITION node config must include a string `field` and `operator`.");
    }
    const comparator = OPERATORS[operator];
    if (!comparator) throw new Error(`Unknown CONDITION operator "${operator}". Valid: ${Object.keys(OPERATORS).join(", ")}.`);

    // Real lookup against the run's actual accumulated data — trigger payload first, then any prior step's output.
    const searchSpace = { ...context.triggerPayload, ...context.stepOutputs };
    const actual = readPath(searchSpace, field);
    const passed = comparator(actual, value);

    return { output: { field, operator, expected: value, actual, passed }, branch: passed ? "true" : "false" };
  },

  DELAY: async (config) => {
    const seconds = config.seconds;
    const untilIso = config.until;
    let resumeAt: Date;
    if (typeof untilIso === "string") {
      const parsed = new Date(untilIso);
      if (Number.isNaN(parsed.getTime())) throw new Error(`DELAY node's "until" is not a valid ISO date: "${untilIso}".`);
      resumeAt = parsed;
    } else if (typeof seconds === "number" && seconds > 0) {
      resumeAt = new Date(Date.now() + seconds * 1000);
    } else {
      throw new Error('DELAY node config must set either a positive numeric "seconds" or a valid ISO "until" date.');
    }
    return { output: { resumeAt: resumeAt.toISOString() }, resumeAt };
  },

  // Real, bounded loop: iterates a real array from context and calls a SINGLE
  // registered node executor once per item, collecting outputs — a "map over
  // array with one action" construct. Does NOT support an arbitrary nested
  // multi-step loop body chain (that would need a materially different DAG
  // model); documented here rather than silently truncating behavior.
  LOOP: async (config, context) => {
    const sourcePath = config.sourcePath;
    const bodyNodeType = config.bodyNodeType;
    const bodyConfig = (config.bodyConfig as Record<string, unknown> | undefined) ?? {};
    const maxIterations = typeof config.maxIterations === "number" ? config.maxIterations : 50;

    if (typeof sourcePath !== "string" || typeof bodyNodeType !== "string") {
      throw new Error('LOOP node config must include a string "sourcePath" (array location in trigger/step data) and "bodyNodeType".');
    }

    const searchSpace = { ...context.triggerPayload, ...context.stepOutputs };
    const items = readPath(searchSpace, sourcePath);
    if (!Array.isArray(items)) {
      throw new Error(`LOOP node's sourcePath "${sourcePath}" did not resolve to a real array.`);
    }

    // Lazy import to avoid a circular dependency with registry.ts (which imports this file).
    const { getNodeExecutor } = await import("./registry");
    const bodyExecutor = getNodeExecutor(bodyNodeType as never);
    if (!bodyExecutor) throw new Error(`LOOP node's bodyNodeType "${bodyNodeType}" has no registered executor.`);

    const results: unknown[] = [];
    for (const item of items.slice(0, maxIterations)) {
      const iterationContext = { ...context, triggerPayload: { ...context.triggerPayload, loopItem: item } };
      const result = await bodyExecutor(bodyConfig, iterationContext);
      results.push(result.output);
    }

    return { output: { iterationCount: results.length, results, truncated: items.length > maxIterations } };
  },
};
