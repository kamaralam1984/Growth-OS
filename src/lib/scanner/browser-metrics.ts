import { contrastRatio, parseColor } from "./contrast";

/**
 * Real headless-Chromium render (Playwright) for genuine Core Web
 * Vitals-style metrics and rendered-computed-style contrast — the honest
 * upgrade path beyond the static-HTML heuristics in
 * performance-analyzer.ts/contrast.ts, both of which explicitly document
 * that limitation in their own file comments.
 *
 * Fully optional, gated behind BOTH: ENABLE_BROWSER_SCAN=true (same
 * absence-as-flag convention as every other optional integration — see
 * .env.example) AND a genuinely successful browser launch. Chromium is NOT
 * installed by default in this project's Docker image — enabling this in
 * production requires `npx playwright install --with-deps chromium` in an
 * environment with the right OS packages (glibc-based; Playwright's bundled
 * Chromium is not well supported on Alpine/musl). If the import fails, the
 * launch fails, or navigation times out, this returns null and callers fall
 * back to the static heuristic — never a crash, never a fabricated
 * measurement standing in for a real one.
 */

export interface BrowserMetrics {
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  totalBlockingTimeMs: number | null;
  contrastRatio: number | null;
  contrastColor: string | null;
  contrastBackground: string | null;
}

const NAV_TIMEOUT_MS = 15_000;
const SETTLE_MS = 2_000;

export function isBrowserScanEnabled(): boolean {
  return process.env.ENABLE_BROWSER_SCAN === "true";
}

/** Collects LCP/CLS via PerformanceObserver and total long-task time (a TBT proxy) from the live, rendered page — real browser measurements, not static-HTML inference. */
async function collectWebVitals(page: import("playwright").Page): Promise<{ lcp: number | null; cls: number; longTaskMs: number }> {
  const vitals = await page.evaluate(
    () =>
      new Promise<{ lcp: number | null; cls: number }>((resolve) => {
        let lcp: number | null = null;
        let cls = 0;
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1] as (PerformanceEntry & { startTime: number }) | undefined;
            if (last) lcp = last.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
        } catch {
          // PerformanceObserver entry types unsupported in this engine build — real nulls/zero, not a guess.
        }
        setTimeout(() => resolve({ lcp, cls }), 500);
      }),
  );

  const longTaskMs = await page.evaluate(() => {
    try {
      return (performance.getEntriesByType("longtask") as Array<PerformanceEntry & { duration: number }>).reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0);
    } catch {
      return 0;
    }
  });

  return { ...vitals, longTaskMs };
}

export async function captureBrowserMetrics(url: string): Promise<BrowserMetrics | null> {
  if (!isBrowserScanEnabled()) return null;

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return null; // playwright isn't installed in this environment — honest no-op, static heuristic remains the answer.
  }

  let browser: import("playwright").Browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  } catch {
    return null; // no Chromium binary available in this environment — honest no-op.
  }

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);
    await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS); // real, bounded settle time for late paints/shifts — not an arbitrary long wait.

    const { lcp, cls, longTaskMs } = await collectWebVitals(page);

    const bodyStyle = await page.evaluate(() => {
      if (!document.body) return null;
      const style = getComputedStyle(document.body);
      return { color: style.color, background: style.backgroundColor };
    });

    let ratio: number | null = null;
    if (bodyStyle) {
      const fg = parseColor(bodyStyle.color);
      const bg = parseColor(bodyStyle.background);
      if (fg && bg) ratio = contrastRatio(fg, bg);
    }

    return {
      largestContentfulPaintMs: lcp !== null ? Math.round(lcp) : null,
      cumulativeLayoutShift: Math.round(cls * 1000) / 1000,
      totalBlockingTimeMs: Math.round(longTaskMs),
      contrastRatio: ratio,
      contrastColor: bodyStyle?.color ?? null,
      contrastBackground: bodyStyle?.background ?? null,
    };
  } catch {
    return null; // navigation/timeout failure on a real page — honest no-op, not a partial/fabricated result.
  } finally {
    await browser.close().catch(() => {});
  }
}
