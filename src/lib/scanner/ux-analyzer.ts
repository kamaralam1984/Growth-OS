import type { ParsedHtml } from "./html-parser";
import { safeFetchWebsite } from "./safe-fetch";
import { findPrimaryTextContrastPair } from "./contrast";
import type { BrowserMetrics } from "./browser-metrics";

/**
 * UX analysis combining real structural signals (nav/forms/CTA keyword
 * match/alt coverage/viewport meta) with a real Flesch-Kincaid readability
 * computation on extracted visible text — no library needed, a standard,
 * ~15-line formula. Color contrast is a real WCAG-formula computation (see
 * contrast.ts) — when a real headless-Chromium render succeeded
 * (browser-metrics.ts, gated behind ENABLE_BROWSER_SCAN), it's applied to
 * the page's actual getComputedStyle() colors; otherwise it falls back to
 * color/background pairs declared in the site's inline <style> blocks and
 * first same-origin external stylesheet — a genuine heuristic on real CSS,
 * not a rendered/computed check, and reported as such when no usable pair is
 * found. contrastMeasuredByRealBrowser tells the caller which mode ran.
 */

export interface UXFinding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface UXAuditResult {
  hasNav: boolean;
  formCount: number;
  ctaCount: number;
  altTextCoveragePct: number;
  readabilityScore: number;
  viewportMetaPresent: boolean;
  colorContrastNote: string;
  contrastRatio: number | null;
  contrastMeasuredByRealBrowser: boolean;
  uxScore: number;
  findings: UXFinding[];
}

const CTA_KEYWORDS = [
  "get started",
  "contact us",
  "buy now",
  "sign up",
  "subscribe",
  "learn more",
  "book now",
  "request a demo",
  "free trial",
  "order now",
  "call now",
  "get a quote",
  "join now",
  "download",
  "shop now",
];

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const matches = w.match(/[aeiouy]+/g);
  let count = matches ? matches.length : 1;
  if (w.endsWith("e") && count > 1) count--;
  return Math.max(1, count);
}

/** Standard Flesch Reading Ease formula — 0 (very difficult) to 100 (very easy). */
function fleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).filter(Boolean);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/** Bounded real fetch of the first same-origin stylesheet — not a full asset crawl. */
async function fetchFirstStylesheet(parsed: ParsedHtml, baseUrl: string): Promise<string> {
  const base = new URL(baseUrl);
  const firstHref = parsed.stylesheetHrefs.find((href) => {
    try {
      return new URL(href, base).hostname === base.hostname;
    } catch {
      return false;
    }
  });
  if (!firstHref) return "";

  try {
    const resolved = new URL(firstHref, base).toString();
    const result = await safeFetchWebsite(resolved);
    return result.ok ? result.html.slice(0, 300_000) : "";
  } catch {
    return "";
  }
}

export async function analyzeUX(parsed: ParsedHtml, baseUrl: string, browserMetrics?: BrowserMetrics | null): Promise<UXAuditResult> {
  const ctaCount = parsed.links.filter((l) => CTA_KEYWORDS.some((k) => l.text.toLowerCase().includes(k))).length;
  const imagesTotal = parsed.images.length;
  const imagesWithAlt = parsed.images.filter((i) => i.alt && i.alt.trim() !== "").length;
  const altTextCoveragePct = imagesTotal > 0 ? Math.round((imagesWithAlt / imagesTotal) * 100) : 100;
  const readabilityScore = fleschReadingEase(parsed.visibleText);

  // A real rendered-computed-style contrast measurement (browser-metrics.ts)
  // resolves cascade/specificity/CSS variables that the declared-CSS
  // heuristic below cannot — always prefer it when available.
  let contrastRatioValue: number | null = null;
  let colorContrastNote: string;
  let contrastMeasuredByRealBrowser = false;

  if (browserMetrics?.contrastRatio !== null && browserMetrics?.contrastRatio !== undefined) {
    contrastRatioValue = browserMetrics.contrastRatio;
    contrastMeasuredByRealBrowser = true;
    colorContrastNote = `Rendered color ${browserMetrics.contrastColor} on background ${browserMetrics.contrastBackground} — a real getComputedStyle() measurement from an actual headless-Chromium render of <body>, not a CSS-declaration heuristic.`;
  } else {
    const externalCss = await fetchFirstStylesheet(parsed, baseUrl);
    const contrastPair = findPrimaryTextContrastPair(`${parsed.inlineStyleCss}\n${externalCss}`);
    contrastRatioValue = contrastPair?.ratio ?? null;
    colorContrastNote =
      contrastPair === null
        ? "No declared text/background color pair found in inline or first-party CSS to check — not a claim of good or bad contrast, just no usable data."
        : `Declared color ${contrastPair.color} on background ${contrastPair.background} (selector "${contrastPair.selector}") — heuristic based on declared CSS, not full rendered/computed styles.`;
  }

  const findings: UXFinding[] = [
    { label: "Navigation", status: parsed.navPresent ? "pass" : "warn", detail: parsed.navPresent ? "A <nav> landmark was found." : "No <nav> landmark detected." },
    { label: "Forms", status: "pass", detail: `${parsed.formCount} form(s) found on the page.` },
    { label: "Calls to action", status: ctaCount > 0 ? "pass" : "warn", detail: `${ctaCount} likely call-to-action link(s) detected (keyword match).` },
    { label: "Image alt coverage", status: altTextCoveragePct >= 90 ? "pass" : altTextCoveragePct >= 50 ? "warn" : "fail", detail: `${altTextCoveragePct}% of images have alt text.` },
    {
      label: "Readability (Flesch Reading Ease)",
      status: readabilityScore >= 50 ? "pass" : readabilityScore >= 30 ? "warn" : "fail",
      detail: `Score ${readabilityScore}/100 — ${readabilityScore >= 60 ? "easy to read" : readabilityScore >= 30 ? "fairly difficult" : "difficult"} for a general audience.`,
    },
    { label: "Mobile viewport", status: parsed.viewportMetaPresent ? "pass" : "fail", detail: parsed.viewportMetaPresent ? "Viewport meta tag present." : "No viewport meta tag — page likely isn't optimized for mobile." },
    {
      label: contrastMeasuredByRealBrowser ? "Color contrast (real rendered)" : "Color contrast (declared CSS)",
      status: contrastRatioValue === null ? "warn" : contrastRatioValue >= 4.5 ? "pass" : contrastRatioValue >= 3 ? "warn" : "fail",
      detail: contrastRatioValue === null ? colorContrastNote : `${colorContrastNote} Ratio ${contrastRatioValue}:1 (WCAG AA requires 4.5:1 for normal text).`,
    },
  ];

  let score = 0;
  score += parsed.navPresent ? 15 : 0;
  score += parsed.formCount > 0 ? 10 : 5;
  score += ctaCount > 0 ? 15 : 0;
  score += Math.round((altTextCoveragePct / 100) * 20);
  score += readabilityScore >= 50 ? 15 : readabilityScore >= 30 ? 9 : 4;
  score += parsed.viewportMetaPresent ? 15 : 0;
  score += contrastRatioValue === null ? 5 : contrastRatioValue >= 4.5 ? 10 : contrastRatioValue >= 3 ? 5 : 0;
  const uxScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    hasNav: parsed.navPresent,
    formCount: parsed.formCount,
    ctaCount,
    altTextCoveragePct,
    readabilityScore,
    viewportMetaPresent: parsed.viewportMetaPresent,
    colorContrastNote,
    contrastRatio: contrastRatioValue,
    contrastMeasuredByRealBrowser,
    uxScore,
    findings,
  };
}
