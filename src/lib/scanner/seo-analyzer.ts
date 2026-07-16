import { safeFetchWebsite } from "./safe-fetch";
import type { ParsedHtml } from "./html-parser";

/**
 * Real, deterministic SEO analysis — every field traces to a real HTML fact
 * or a real extra fetch (/sitemap.xml, /robots.txt, a bounded broken-link
 * spot-check). Documented `seoScore` formula, same style as lead-scoring.ts:
 * every point is commented, sums to 100 at full marks.
 */

export interface SEOFinding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SEOAuditResult {
  metaTitle: string | null;
  metaDescription: string | null;
  hasCanonical: boolean;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  hasSchema: boolean;
  h1Count: number;
  headingStructureValid: boolean;
  internalLinksCount: number;
  externalLinksCount: number;
  brokenLinksSampleCount: number;
  brokenLinksChecked: number;
  imagesTotal: number;
  imagesWithoutAlt: number;
  hasSitemap: boolean;
  hasRobotsTxt: boolean;
  isIndexable: boolean;
  seoScore: number;
  findings: SEOFinding[];
}

const BROKEN_LINK_SAMPLE_SIZE = 10;

function headingStructureIsValid(headings: Array<{ level: number }>): boolean {
  let prevLevel = 0;
  for (const h of headings) {
    if (prevLevel > 0 && h.level > prevLevel + 1) return false;
    prevLevel = h.level;
  }
  return true;
}

export async function analyzeSEO(parsed: ParsedHtml, baseUrl: string): Promise<SEOAuditResult> {
  const findings: SEOFinding[] = [];
  const base = new URL(baseUrl);

  const titleLen = parsed.title?.length ?? 0;
  findings.push(
    parsed.title
      ? { label: "Meta title", status: titleLen >= 10 && titleLen <= 60 ? "pass" : "warn", detail: `"${parsed.title}" (${titleLen} chars)` }
      : { label: "Meta title", status: "fail", detail: "No <title> tag found." },
  );

  const descLen = parsed.metaDescription?.length ?? 0;
  findings.push(
    parsed.metaDescription
      ? { label: "Meta description", status: descLen >= 50 && descLen <= 160 ? "pass" : "warn", detail: `${descLen} characters` }
      : { label: "Meta description", status: "fail", detail: "No meta description found." },
  );

  findings.push({ label: "Canonical tag", status: parsed.canonical ? "pass" : "warn", detail: parsed.canonical ?? "Not present." });
  findings.push({ label: "Open Graph tags", status: parsed.hasOpenGraph ? "pass" : "warn", detail: parsed.hasOpenGraph ? "Present." : "Not found." });
  findings.push({ label: "Twitter Card tags", status: parsed.hasTwitterCard ? "pass" : "warn", detail: parsed.hasTwitterCard ? "Present." : "Not found." });
  findings.push({ label: "Structured data (schema)", status: parsed.hasSchema ? "pass" : "warn", detail: parsed.hasSchema ? "Found JSON-LD or itemscope markup." : "Not found." });

  const h1Count = parsed.headings.filter((h) => h.level === 1).length;
  findings.push({
    label: "H1 heading",
    status: h1Count === 1 ? "pass" : h1Count === 0 ? "fail" : "warn",
    detail: `${h1Count} H1 tag(s) found.`,
  });

  const structureValid = headingStructureIsValid(parsed.headings);
  findings.push({
    label: "Heading hierarchy",
    status: structureValid ? "pass" : "warn",
    detail: structureValid ? "No skipped heading levels detected." : "Heading levels skip (e.g. H2 straight to H4).",
  });

  const imagesTotal = parsed.images.length;
  const imagesWithoutAlt = parsed.images.filter((i) => !i.alt || i.alt.trim() === "").length;
  const altPct = imagesTotal > 0 ? Math.round(((imagesTotal - imagesWithoutAlt) / imagesTotal) * 100) : 100;
  findings.push({
    label: "Image alt text",
    status: altPct >= 90 ? "pass" : altPct >= 50 ? "warn" : "fail",
    detail: `${imagesTotal - imagesWithoutAlt}/${imagesTotal} images have alt text (${altPct}%).`,
  });

  const internalLinks = parsed.links.filter((l) => l.isInternal);
  const externalLinks = parsed.links.filter((l) => !l.isInternal);

  const [sitemapResult, robotsResult] = await Promise.all([
    safeFetchWebsite(new URL("/sitemap.xml", base).toString()),
    safeFetchWebsite(new URL("/robots.txt", base).toString()),
  ]);
  const hasSitemap = sitemapResult.ok;
  const hasRobotsTxt = robotsResult.ok;
  const isIndexable = !(robotsResult.ok && /disallow:\s*\/\s*$/im.test(robotsResult.html));
  findings.push({ label: "Sitemap.xml", status: hasSitemap ? "pass" : "warn", detail: hasSitemap ? "Found at /sitemap.xml." : "Not found at /sitemap.xml." });
  findings.push({ label: "Robots.txt", status: hasRobotsTxt ? "pass" : "warn", detail: hasRobotsTxt ? "Found at /robots.txt." : "Not found at /robots.txt." });
  findings.push({
    label: "Indexability",
    status: isIndexable ? "pass" : "fail",
    detail: isIndexable ? "No site-wide disallow directive detected." : "robots.txt appears to disallow all crawling.",
  });

  // Bounded spot-check, not an exhaustive crawl — brokenLinksChecked records exactly how many were sampled.
  const sample = [...new Set(internalLinks.map((l) => l.href))].slice(0, BROKEN_LINK_SAMPLE_SIZE);
  let brokenCount = 0;
  for (const href of sample) {
    try {
      const resolved = new URL(href, base).toString();
      const result = await safeFetchWebsite(resolved);
      if (!result.ok) brokenCount++;
    } catch {
      brokenCount++;
    }
  }
  findings.push({
    label: "Broken links (sample)",
    status: brokenCount === 0 ? "pass" : brokenCount <= 2 ? "warn" : "fail",
    detail: `${brokenCount} broken out of ${sample.length} sampled internal links.`,
  });

  let score = 0;
  score += parsed.title ? (titleLen >= 10 && titleLen <= 60 ? 15 : 8) : 0;
  score += parsed.metaDescription ? (descLen >= 50 && descLen <= 160 ? 15 : 8) : 0;
  score += parsed.canonical ? 8 : 0;
  score += parsed.hasOpenGraph ? 7 : 0;
  score += parsed.hasTwitterCard ? 5 : 0;
  score += parsed.hasSchema ? 8 : 0;
  score += h1Count === 1 ? 10 : h1Count === 0 ? 0 : 5;
  score += structureValid ? 5 : 0;
  score += Math.round((altPct / 100) * 12);
  score += hasSitemap ? 7 : 0;
  score += hasRobotsTxt ? 4 : 0;
  score += isIndexable ? 4 : 0;
  score -= brokenCount * 2;
  const seoScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    metaTitle: parsed.title,
    metaDescription: parsed.metaDescription,
    hasCanonical: Boolean(parsed.canonical),
    hasOpenGraph: parsed.hasOpenGraph,
    hasTwitterCard: parsed.hasTwitterCard,
    hasSchema: parsed.hasSchema,
    h1Count,
    headingStructureValid: structureValid,
    internalLinksCount: internalLinks.length,
    externalLinksCount: externalLinks.length,
    brokenLinksSampleCount: brokenCount,
    brokenLinksChecked: sample.length,
    imagesTotal,
    imagesWithoutAlt,
    hasSitemap,
    hasRobotsTxt,
    isIndexable,
    seoScore,
    findings,
  };
}
