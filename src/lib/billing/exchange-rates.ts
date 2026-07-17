import { withCache } from "@/lib/cache/redis-cache";

/**
 * Real, live indicative FX rates via Frankfurter (frankfurter.dev) — a free,
 * keyless API that republishes the European Central Bank's daily reference
 * rates. Purely a DISPLAY-ONLY informational layer: nothing here feeds into
 * what a customer is actually charged — see plan-catalog.ts's own comment
 * ("admin-configured round numbers, never a live FX conversion") for why
 * real prices stay fixed per SUPPORTED_PLAN_CURRENCY regardless of what this
 * file returns. Never fabricates a fallback rate: any failure returns null.
 *
 * ECB reference rates don't cover every SUPPORTED_PLAN_CURRENCY — notably
 * AED and SAR aren't ECB-published, so Frankfurter 404s those pairs.
 * getLiveExchangeRate treats "unsupported pair" the same as "unreachable":
 * null, never a guess.
 *
 * Cached in Redis (src/lib/cache/redis-cache.ts) for FX_CACHE_TTL_SECONDS so
 * a busy pricing page never turns into a hot path hammering a free,
 * rate-limited public API on every render. withCache itself degrades to "no
 * cache" rather than throwing if Redis is unreachable, and a null result
 * (unsupported pair / API down) is never written back as a cached "success"
 * — JSON-serialized null round-trips as a cache miss, so a transient outage
 * self-heals on the next call instead of being pinned for the full TTL.
 */

const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1/latest";
const FX_CACHE_TTL_SECONDS = 12 * 60 * 60; // 12h — indicative FX doesn't need to be real-time
const FETCH_TIMEOUT_MS = 5000;

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

async function fetchLiveRate(from: string, to: string): Promise<number | null> {
  try {
    const url = `${FRANKFURTER_BASE_URL}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

    if (!response.ok) {
      // 404 is Frankfurter's real response for a currency it doesn't
      // publish (e.g. AED, SAR) — an expected "unsupported pair" outcome,
      // not a fetch failure worth logging as an error.
      if (response.status !== 404) {
        const body = await response.text().catch(() => "");
        console.error(`[exchange-rates] Frankfurter rejected ${from}->${to} (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
      return null;
    }

    const data = (await response.json()) as FrankfurterLatestResponse;
    const rate = data.rates?.[to];
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (error) {
    console.error(`[exchange-rates] fetch failed for ${from}->${to}:`, error);
    return null;
  }
}

/**
 * Real live rate (1 `from` = N `to`) from Frankfurter/ECB, Redis-cached for
 * FX_CACHE_TTL_SECONDS. Returns null — never a fabricated or stale-looking
 * number — if the pair is unsupported, the network/API is unreachable, or
 * the response can't be parsed into a finite positive rate.
 */
export async function getLiveExchangeRate(from: string, to: string): Promise<number | null> {
  const fromCurrency = from.trim().toUpperCase();
  const toCurrency = to.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(fromCurrency) || !/^[A-Z]{3}$/.test(toCurrency)) return null;
  if (fromCurrency === toCurrency) return 1;

  const cacheKey = `fx:rate:${fromCurrency}:${toCurrency}`;
  return withCache<number | null>(cacheKey, FX_CACHE_TTL_SECONDS, () => fetchLiveRate(fromCurrency, toCurrency));
}
