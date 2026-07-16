import type { ParsedHtml } from "./html-parser";

/**
 * UX analysis combining real structural signals (nav/forms/CTA keyword
 * match/alt coverage/viewport meta) with a real Flesch-Kincaid readability
 * computation on extracted visible text — no library needed, a standard,
 * ~15-line formula. colorContrastNote is always the honest "not measured"
 * string: real contrast checking needs rendered CSS, out of scope for a
 * static HTML scan.
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

export function analyzeUX(parsed: ParsedHtml): UXAuditResult {
  const ctaCount = parsed.links.filter((l) => CTA_KEYWORDS.some((k) => l.text.toLowerCase().includes(k))).length;
  const imagesTotal = parsed.images.length;
  const imagesWithAlt = parsed.images.filter((i) => i.alt && i.alt.trim() !== "").length;
  const altTextCoveragePct = imagesTotal > 0 ? Math.round((imagesWithAlt / imagesTotal) * 100) : 100;
  const readabilityScore = fleschReadingEase(parsed.visibleText);
  const colorContrastNote = "Not measured — requires rendered CSS, out of scope for a static scan.";

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
    { label: "Color contrast", status: "warn", detail: colorContrastNote },
  ];

  let score = 0;
  score += parsed.navPresent ? 15 : 0;
  score += parsed.formCount > 0 ? 10 : 5;
  score += ctaCount > 0 ? 15 : 0;
  score += Math.round((altTextCoveragePct / 100) * 20);
  score += readabilityScore >= 50 ? 20 : readabilityScore >= 30 ? 12 : 5;
  score += parsed.viewportMetaPresent ? 20 : 0;
  const uxScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    hasNav: parsed.navPresent,
    formCount: parsed.formCount,
    ctaCount,
    altTextCoveragePct,
    readabilityScore,
    viewportMetaPresent: parsed.viewportMetaPresent,
    colorContrastNote,
    uxScore,
    findings,
  };
}
