import Anthropic from "@anthropic-ai/sdk";

/**
 * Whether real Claude API calls can be made. Every AI runtime function checks
 * this first — with no key configured, the app must show an explicit
 * "AI not connected" state, never fabricated/placeholder agent output.
 */
export function isAIConnected(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;

/** Throws AINotConnectedError if ANTHROPIC_API_KEY is not configured. */
export function getAnthropicClient(): Anthropic {
  if (!isAIConnected()) {
    throw new AINotConnectedError();
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export class AINotConnectedError extends Error {
  constructor() {
    super("AI_NOT_CONNECTED");
    this.name = "AINotConnectedError";
  }
}

/**
 * Thrown when the Anthropic API key IS configured and valid, but the
 * request failed because the account has no usable credit balance
 * (Anthropic.BadRequestError with a "credit balance is too low" message).
 * Distinct from AINotConnectedError (no key at all) — callers must show a
 * different, honest message for each case rather than a generic 500.
 */
export class AIBillingError extends Error {
  constructor(cause?: unknown) {
    super("AI_BILLING_ERROR");
    this.name = "AIBillingError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * True if `error` is an Anthropic.BadRequestError specifically caused by an
 * insufficient credit balance, as opposed to any other 400 (bad params,
 * malformed request, etc). Callers should re-throw the result as
 * AIBillingError rather than letting it fall through as a generic error.
 */
export function isAIBillingError(error: unknown): boolean {
  return (
    error instanceof Anthropic.BadRequestError &&
    typeof error.message === "string" &&
    /credit balance is too low/i.test(error.message)
  );
}

/** The one model this app is allowed to use for agent reasoning. */
export const AGENT_MODEL = "claude-opus-4-8";
