import { isAIConnected } from "@/lib/ai/client";
import { generateText } from "@/lib/ai/fallback";

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
 * isAIConnected() alone only reports whether at least one provider's API key
 * is configured (Anthropic OR any of the free fallback providers); it cannot
 * distinguish a working key from one on an account with zero credit balance.
 * The only honest way to know that is to attempt a real, minimal call
 * through the same fallback chain every other AI call goes through
 * (src/lib/ai/fallback.ts) and see how it fails — Anthropic checks the
 * credit balance before generating/billing any tokens, so a call that fails
 * with "credit balance is too low" costs nothing. This never fabricates a
 * status from local guesswork.
 *
 * "no_credits" now means "at least one provider is configured, but the
 * entire chain failed" rather than strictly "Anthropic is out of credit" —
 * broadened along with the chain itself, since a single working free-tier
 * provider is enough to report "connected" even if Anthropic's own credit is
 * exhausted.
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
    await generateText({ system: "", userContent: "ping", maxTokens: 1 });
    status = "connected";
  } catch {
    // Every configured provider in the chain failed. isAIConnected() already
    // confirmed at least one key is set, so this is "configured but not
    // working" — the same user-facing state "no_credits" always meant, now
    // just not assumed to be Anthropic-specific.
    status = "no_credits";
  }

  cached = { status, expiresAt: Date.now() + CACHE_TTL_MS };
  return status;
}
