import type { ParsedHtml } from "./html-parser";
import type { BrowserMetrics } from "./browser-metrics";

/**
 * Heuristic performance analysis from real static-response and
 * static-markup signals — response time (genuinely measured by
 * safe-fetch), real HTML byte size, real structural tag counts, real
 * Cache-Control/Content-Encoding headers, real render-blocking-script
 * detection (script tags in <head> without async/defer), and real image
 * format/lazy-loading attribute inspection. When ENABLE_BROWSER_SCAN is on
 * and a real headless-Chromium render succeeds (browser-metrics.ts), real
 * Core Web Vitals (LCP/CLS/a long-task-based TBT proxy) are blended in too —
 * a genuine measurement, not a full Lighthouse report, but no longer
 * "static analysis only". Without that, this remains a heuristic estimate —
 * every UI surface of this data must say so honestly (measuredByRealBrowser
 * tells the caller which mode produced a given result).
 */

const MODERN_IMAGE_EXTENSIONS = /\.(webp|avif)(\?|#|$)/i;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i;

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
  renderBlockingScriptCount: number;
  modernImageFormatPct: number;
  lazyLoadedImagePct: number;
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  totalBlockingTimeMs: number | null;
  measuredByRealBrowser: boolean;
  performanceScore: number;
  findings: PerformanceFinding[];
}

export function analyzePerformance(params: { responseTimeMs: number; html: string; headers: Headers; parsed: ParsedHtml; browserMetrics?: BrowserMetrics | null }): PerformanceAuditResult {
  const { responseTimeMs, html, headers, parsed, browserMetrics } = params;
  const htmlSizeBytes = Buffer.byteLength(html, "utf-8");
  const scriptTagCount = parsed.scriptSrcs.length;
  const stylesheetCount = parsed.stylesheetHrefs.length;
  const imageTagCount = parsed.images.length;
  const renderBlockingScriptCount = parsed.scriptsWithoutAsyncOrDefer;

  const cacheControl = headers.get("cache-control");
  const hasCaching = Boolean(cacheControl && !/no-store/i.test(cacheControl));
  const contentEncoding = headers.get("content-encoding");
  const hasCompression = Boolean(contentEncoding && /(gzip|br|deflate)/i.test(contentEncoding));

  // Real inspection of <img> src extensions and loading="lazy" attributes —
  // both are direct DOM facts, no rendering required.
  const imagesWithKnownExt = parsed.images.filter((i) => IMAGE_EXTENSION.test(i.src));
  const modernFormatCount = imagesWithKnownExt.filter((i) => MODERN_IMAGE_EXTENSIONS.test(i.src)).length;
  const modernImageFormatPct = imagesWithKnownExt.length > 0 ? Math.round((modernFormatCount / imagesWithKnownExt.length) * 100) : 100;
  const lazyLoadedCount = parsed.rawHtml.match(/<img\b[^>]*\bloading=["']lazy["']/gi)?.length ?? 0;
  const lazyLoadedImagePct = imageTagCount > 0 ? Math.round((lazyLoadedCount / imageTagCount) * 100) : 100;

  const findings: PerformanceFinding[] = [
    { label: "Response time", status: responseTimeMs < 800 ? "pass" : responseTimeMs < 2000 ? "warn" : "fail", detail: `${responseTimeMs}ms to first byte (this scan's real fetch time).` },
    { label: "HTML document size", status: htmlSizeBytes < 100_000 ? "pass" : htmlSizeBytes < 300_000 ? "warn" : "fail", detail: `${(htmlSizeBytes / 1024).toFixed(1)} KB` },
    { label: "Script tags", status: scriptTagCount < 15 ? "pass" : scriptTagCount < 30 ? "warn" : "fail", detail: `${scriptTagCount} external script tag(s).` },
    {
      label: "Render-blocking scripts",
      status: renderBlockingScriptCount === 0 ? "pass" : renderBlockingScriptCount <= 3 ? "warn" : "fail",
      detail: `${renderBlockingScriptCount} script tag(s) in <head> without async/defer — these block initial page render.`,
    },
    { label: "Stylesheets", status: stylesheetCount < 5 ? "pass" : "warn", detail: `${stylesheetCount} external stylesheet(s).` },
    { label: "Compression", status: hasCompression ? "pass" : "warn", detail: hasCompression ? `Content-Encoding: ${contentEncoding}` : "No gzip/brotli compression header detected." },
    { label: "Caching headers", status: hasCaching ? "pass" : "warn", detail: hasCaching ? `Cache-Control: ${cacheControl}` : "No effective Cache-Control header detected." },
    {
      label: "Modern image formats",
      status: imagesWithKnownExt.length === 0 ? "pass" : modernImageFormatPct >= 70 ? "pass" : modernImageFormatPct >= 30 ? "warn" : "fail",
      detail: imagesWithKnownExt.length === 0 ? "No raster images with a recognizable extension to check." : `${modernFormatCount}/${imagesWithKnownExt.length} images use webp/avif (${modernImageFormatPct}%).`,
    },
    {
      label: "Lazy-loaded images",
      status: imageTagCount === 0 ? "pass" : lazyLoadedImagePct >= 50 ? "pass" : "warn",
      detail: imageTagCount === 0 ? "No images on the page." : `${lazyLoadedCount}/${imageTagCount} images use loading="lazy" (${lazyLoadedImagePct}%).`,
    },
  ];

  let score = 0;
  score += responseTimeMs < 800 ? 18 : responseTimeMs < 2000 ? 10 : 4;
  score += htmlSizeBytes < 100_000 ? 14 : htmlSizeBytes < 300_000 ? 8 : 3;
  score += scriptTagCount < 15 ? 14 : scriptTagCount < 30 ? 7 : 0;
  score += renderBlockingScriptCount === 0 ? 12 : renderBlockingScriptCount <= 3 ? 6 : 0;
  score += stylesheetCount < 5 ? 8 : 4;
  score += hasCompression ? 12 : 0;
  score += hasCaching ? 8 : 0;
  score += Math.round((modernImageFormatPct / 100) * 7);
  score += Math.round((lazyLoadedImagePct / 100) * 7);
  let performanceScore = Math.max(0, Math.min(100, Math.round(score)));

  const measuredByRealBrowser = Boolean(browserMetrics);
  if (browserMetrics) {
    const { largestContentfulPaintMs, cumulativeLayoutShift, totalBlockingTimeMs } = browserMetrics;
    findings.push(
      {
        label: "Largest Contentful Paint (real browser)",
        status: largestContentfulPaintMs === null ? "warn" : largestContentfulPaintMs <= 2500 ? "pass" : largestContentfulPaintMs <= 4000 ? "warn" : "fail",
        detail: largestContentfulPaintMs === null ? "Could not be measured in the real render." : `${largestContentfulPaintMs}ms, measured by an actual headless-Chromium render (Google's "good" threshold is ≤2500ms).`,
      },
      {
        label: "Cumulative Layout Shift (real browser)",
        status: cumulativeLayoutShift === null ? "warn" : cumulativeLayoutShift <= 0.1 ? "pass" : cumulativeLayoutShift <= 0.25 ? "warn" : "fail",
        detail: cumulativeLayoutShift === null ? "Could not be measured in the real render." : `${cumulativeLayoutShift}, measured by an actual headless-Chromium render (Google's "good" threshold is ≤0.1).`,
      },
      {
        label: "Total Blocking Time (real browser, long-task proxy)",
        status: totalBlockingTimeMs === null ? "warn" : totalBlockingTimeMs <= 200 ? "pass" : totalBlockingTimeMs <= 600 ? "warn" : "fail",
        detail: totalBlockingTimeMs === null ? "Could not be measured in the real render." : `${totalBlockingTimeMs}ms of main-thread long-task time after load (Google's "good" threshold is ≤200ms).`,
      },
    );

    // Real Core Web Vitals now make up 40% of the score, blended with the
    // static-signal score above — a genuine accuracy upgrade over
    // static-analysis alone, not a replacement (page weight/caching/render-
    // blocking scripts are still real, independently useful signals).
    let cwvScore = 0;
    cwvScore += largestContentfulPaintMs === null ? 8 : largestContentfulPaintMs <= 2500 ? 15 : largestContentfulPaintMs <= 4000 ? 8 : 0;
    cwvScore += cumulativeLayoutShift === null ? 8 : cumulativeLayoutShift <= 0.1 ? 15 : cumulativeLayoutShift <= 0.25 ? 8 : 0;
    cwvScore += totalBlockingTimeMs === null ? 5 : totalBlockingTimeMs <= 200 ? 10 : totalBlockingTimeMs <= 600 ? 5 : 0;
    performanceScore = Math.max(0, Math.min(100, Math.round(performanceScore * 0.6 + (cwvScore / 40) * 100 * 0.4)));
  }

  return {
    responseTimeMs,
    htmlSizeBytes,
    scriptTagCount,
    stylesheetCount,
    imageTagCount,
    hasCaching,
    hasCompression,
    renderBlockingScriptCount,
    modernImageFormatPct,
    lazyLoadedImagePct,
    largestContentfulPaintMs: browserMetrics?.largestContentfulPaintMs ?? null,
    cumulativeLayoutShift: browserMetrics?.cumulativeLayoutShift ?? null,
    totalBlockingTimeMs: browserMetrics?.totalBlockingTimeMs ?? null,
    measuredByRealBrowser,
    performanceScore,
    findings,
  };
}
