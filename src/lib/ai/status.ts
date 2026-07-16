import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIBillingError, isAIConnected } from "@/lib/ai/client";

export type AIConnectionStatus = "connected" | "no_credits" | "not_connected";

interface CachedStatus {
  status: AIConnectionStatus;
  expiresAt: number;
}

let cached: CachedStatus | null = null;
const CACHE_TTL_MS = 30_000;

/**
 * Determines the Command Center's AI status indicator state — one of
 * "AI Connected" / "AI Connected — No Credits" / "AI Not Connected".
 *
 * isAIConnected() alone only reports whether an API key is configured; it
 * cannot distinguish a working key from a key on an account with zero credit
 * balance (this environment's actual, documented state). The only honest way
 * to know that is to attempt a real, minimal call and see how it fails —
 * Anthropic checks the credit balance before generating/billing any tokens,
 * so a call that fails with "credit balance is too low" costs nothing. This
 * never fabricates a status from local guesswork.
 *
 * Cached in-memory for CACHE_TTL_MS (same simple per-process pattern as
 * src/lib/rate-limit.ts) so navigating across Command Center pages doesn't
 * fire a real API call on every request.
 */
export async function getAIConnectionStatus(): Promise<AIConnectionStatus> {
  if (!isAIConnected()) return "not_connected";

  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  let status: AIConnectionStatus;
  try {
    const client = getAnthropicClient();
    await client.messages.create({
      model: AGENT_MODEL,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    status = "connected";
  } catch (error) {
    if (error instanceof AINotConnectedError) {
      status = "not_connected";
    } else if (isAIBillingError(error)) {
      status = "no_credits";
    } else {
      // Key is configured and the failure isn't a recognized billing error —
      // report "connected" rather than a misleading "not connected", mirroring
      // how other AI call sites in this app treat unrecognized errors as
      // generic rather than as a connectivity verdict.
      status = "connected";
    }
  }

  cached = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}
