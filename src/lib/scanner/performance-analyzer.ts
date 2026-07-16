import type { ParsedHtml } from "./html-parser";

/**
 * Heuristic performance analysis from real static-response signals —
 * response time (genuinely measured by safe-fetch), real HTML byte size,
 * real structural tag counts, real Cache-Control/Content-Encoding headers.
 * Explicitly NOT a Lighthouse/Core Web Vitals measurement — that needs a
 * real rendered browser, not available here. Every UI surface of this data
 * must carry that disclaimer.
 */

export interface PerformanceFinding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface PerformanceAuditResult {
  responseTimeMs: number;
  htmlSizeBytes: number;
  scriptTagCount: number;
  stylesheetCount: number;
  imageTagCount: number;
  hasCaching: boolean;
  hasCompression: boolean;
  performanceScore: number;
  findings: PerformanceFinding[];
}

export function analyzePerformance(params: { responseTimeMs: number; html: string; headers: Headers; parsed: ParsedHtml }): PerformanceAuditResult {
  const { responseTimeMs, html, headers, parsed } = params;
  const htmlSizeBytes = Buffer.byteLength(html, "utf-8");
  const scriptTagCount = parsed.scriptSrcs.length;
  const stylesheetCount = parsed.stylesheetHrefs.length;
  const imageTagCount = parsed.images.length;

  const cacheControl = headers.get("cache-control");
  const hasCaching = Boolean(cacheControl && !/no-store/i.test(cacheControl));
  const contentEncoding = headers.get("content-encoding");
  const hasCompression = Boolean(contentEncoding && /(gzip|br|deflate)/i.test(contentEncoding));

  const findings: PerformanceFinding[] = [
    { label: "Response time", status: responseTimeMs < 800 ? "pass" : responseTimeMs < 2000 ? "warn" : "fail", detail: `${responseTimeMs}ms to first byte (this scan's real fetch time).` },
    { label: "HTML document size", status: htmlSizeBytes < 100_000 ? "pass" : htmlSizeBytes < 300_000 ? "warn" : "fail", detail: `${(htmlSizeBytes / 1024).toFixed(1)} KB` },
    { label: "Script tags", status: scriptTagCount < 15 ? "pass" : scriptTagCount < 30 ? "warn" : "fail", detail: `${scriptTagCount} external script tag(s).` },
    { label: "Stylesheets", status: stylesheetCount < 5 ? "pass" : "warn", detail: `${stylesheetCount} external stylesheet(s).` },
    { label: "Compression", status: hasCompression ? "pass" : "warn", detail: hasCompression ? `Content-Encoding: ${contentEncoding}` : "No gzip/brotli compression header detected." },
    { label: "Caching headers", status: hasCaching ? "pass" : "warn", detail: hasCaching ? `Cache-Control: ${cacheControl}` : "No effective Cache-Control header detected." },
  ];

  let score = 0;
  score += responseTimeMs < 800 ? 25 : responseTimeMs < 2000 ? 15 : 5;
  score += htmlSizeBytes < 100_000 ? 20 : htmlSizeBytes < 300_000 ? 12 : 5;
  score += scriptTagCount < 15 ? 20 : scriptTagCount < 30 ? 10 : 0;
  score += stylesheetCount < 5 ? 10 : 5;
  score += hasCompression ? 15 : 0;
  score += hasCaching ? 10 : 0;
  const performanceScore = Math.max(0, Math.min(100, Math.round(score)));

  return { responseTimeMs, htmlSizeBytes, scriptTagCount, stylesheetCount, imageTagCount, hasCaching, hasCompression, performanceScore, findings };
}
