import { safeFetchWebsite } from "@/lib/scanner/safe-fetch";
import { parseHtml, type ParsedHtml } from "@/lib/scanner/html-parser";

/**
 * Multi-page site discovery for the AI Company Understanding Engine (Step 1).
 * Built entirely on the existing single-URL scanner primitives — safeFetchWebsite
 * (SSRF-protected fetch) and parseHtml (structural extraction) — nothing here
 * introduces a new network path. Sequential, not parallel: politer toward the
 * target site and matches "respect the site, don't hammer it" from the spec.
 */

export interface CrawledPage {
  url: string;
  pageType: string;
  title: string | null;
  parsed: ParsedHtml;
}

export interface CrawlResult {
  pages: CrawledPage[];
  skippedByRobots: string[];
  pagesDiscoveredButNotCrawled: number;
  homepageFetchError?: string;
}

const MAX_PAGES = 15;

// Path-keyword classification only — never guesses a page's purpose from its
// content, only from its URL, so a page we can't classify is simply not crawled
// rather than mis-labeled.
const PAGE_TYPE_KEYWORDS: Record<string, string[]> = {
  about: ["about"],
  services: ["service"],
  products: ["product"],
  solutions: ["solution"],
  industries: ["industr"],
  portfolio: ["portfolio", "our-work", "case-work"],
  "case-studies": ["case-stud", "casestud", "success-stor"],
  clients: ["client", "customer"],
  pricing: ["pricing", "plans", "price"],
  careers: ["career", "jobs", "hiring"],
  contact: ["contact"],
  blog: ["blog", "news", "insights"],
  resources: ["resource"],
  faq: ["faq"],
  docs: ["docs", "documentation"],
  "api-docs": ["api-doc", "api-reference", "/api"],
  support: ["support", "help"],
  privacy: ["privacy"],
  terms: ["terms", "tos"],
};

function classifyPageType(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  for (const [type, keywords] of Object.entries(PAGE_TYPE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return type;
  }
  return null;
}

/** Real per-path robots.txt Disallow parsing for the wildcard (`User-agent: *`) block — a hard
 * skip-list for crawl targets, not merely an audit signal like the Website Scanner's shallow check. */
async function fetchRobotsDisallowRules(base: URL): Promise<string[]> {
  const result = await safeFetchWebsite(new URL("/robots.txt", base).toString());
  if (!result.ok) return [];

  const disallows: string[] = [];
  let inWildcardBlock = false;
  for (const rawLine of result.html.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^user-agent:\s*\*/i.test(line)) {
      inWildcardBlock = true;
      continue;
    }
    if (/^user-agent:/i.test(line)) {
      inWildcardBlock = false;
      continue;
    }
    if (!inWildcardBlock) continue;
    const match = line.match(/^disallow:\s*(\S*)/i);
    if (match && match[1]) disallows.push(match[1]);
  }
  return disallows;
}

function isDisallowed(pathname: string, disallowRules: string[]): boolean {
  return disallowRules.some((rule) => rule === "/" || pathname.startsWith(rule));
}

export async function crawlWebsite(websiteUrl: string): Promise<CrawlResult> {
  const homepage = await safeFetchWebsite(websiteUrl);
  if (!homepage.ok) {
    return { pages: [], skippedByRobots: [], pagesDiscoveredButNotCrawled: 0, homepageFetchError: homepage.error };
  }

  const base = new URL(homepage.finalUrl);
  const disallowRules = await fetchRobotsDisallowRules(base);
  const homeParsed = parseHtml(homepage.html, homepage.finalUrl);

  const pages: CrawledPage[] = [];
  const skippedByRobots: string[] = [];

  if (isDisallowed(base.pathname || "/", disallowRules)) {
    skippedByRobots.push(base.toString());
  } else {
    pages.push({ url: homepage.finalUrl, pageType: "home", title: homeParsed.title, parsed: homeParsed });
  }

  const seenPaths = new Set<string>([base.pathname || "/"]);
  const candidates: Array<{ url: string; pageType: string }> = [];
  for (const link of homeParsed.links) {
    if (!link.isInternal) continue;
    let resolved: URL;
    try {
      resolved = new URL(link.href, base);
    } catch {
      continue;
    }
    if (seenPaths.has(resolved.pathname)) continue;
    const pageType = classifyPageType(resolved.pathname);
    if (!pageType) continue;
    seenPaths.add(resolved.pathname);
    candidates.push({ url: resolved.toString(), pageType });
  }

  const pagesDiscoveredButNotCrawled = Math.max(0, candidates.length - (MAX_PAGES - pages.length));

  for (const candidate of candidates) {
    if (pages.length >= MAX_PAGES) break;

    const candidatePath = new URL(candidate.url).pathname;
    if (isDisallowed(candidatePath, disallowRules)) {
      skippedByRobots.push(candidate.url);
      continue;
    }

    const fetched = await safeFetchWebsite(candidate.url);
    if (!fetched.ok) continue; // unreachable page — simply excluded, never fabricated

    const parsed = parseHtml(fetched.html, fetched.finalUrl);
    pages.push({ url: fetched.finalUrl, pageType: candidate.pageType, title: parsed.title, parsed });
  }

  return { pages, skippedByRobots, pagesDiscoveredButNotCrawled };
}
