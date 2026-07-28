/**
 * Real Google SERP rank check via SerpApi (https://serpapi.com) — genuinely
 * pluggable, gated purely on SERPAPI_KEY being set (same "absence-as-flag,
 * honest not-configured" convention as every other optional integration in
 * this app — see .env.example). Google itself has no public rank-check API;
 * a real SERP-scraping provider is the only honest way to get this number,
 * and it is NEVER simulated/guessed when no key is set — the caller must
 * treat a null return as "not configured", not "ranked outside the results".
 */

export const SEO_RANK_RESULTS_CHECKED = 20;
const RANK_CHECK_TIMEOUT_MS = 10_000;

export interface SeoRankResult {
  keyword: string;
  position: number | null;
  provider: string;
  checkedAt: Date;
  found: boolean;
  error: string | null;
}

interface SerpApiOrganicResult {
  link?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganicResult[];
}

export function isSeoRankCheckConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Returns null when no rank-check provider is configured — never a fabricated position. */
export async function checkSeoRank(params: { keyword: string; targetHostname: string }): Promise<SeoRankResult | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) return null;

  const provider = "serpapi.com";
  const checkedAt = new Date();
  const targetHost = normalizeHost(params.targetHostname);

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", params.keyword);
  url.searchParams.set("num", String(SEO_RANK_RESULTS_CHECKED));
  url.searchParams.set("api_key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RANK_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      return { keyword: params.keyword, position: null, provider, checkedAt, found: false, error: `Rank-check provider returned HTTP ${response.status}.` };
    }

    const data = (await response.json()) as SerpApiResponse;
    const results = data.organic_results ?? [];
    const index = results.findIndex((r) => {
      if (!r.link) return false;
      try {
        return normalizeHost(new URL(r.link).hostname) === targetHost;
      } catch {
        return false;
      }
    });

    return {
      keyword: params.keyword,
      position: index >= 0 ? index + 1 : null,
      provider,
      checkedAt,
      found: index >= 0,
      error: null,
    };
  } catch (error) {
    return {
      keyword: params.keyword,
      position: null,
      provider,
      checkedAt,
      found: false,
      error: error instanceof Error && error.name === "AbortError" ? "Rank check timed out." : "Could not complete the rank check.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
