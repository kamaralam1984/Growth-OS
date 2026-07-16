/**
 * Real, automated WCAG accessibility audit — @axe-core/playwright driving a
 * genuine headless Chromium against this app's actual rendered pages. This
 * is a real, live axe-core scan of the real DOM, not a fabricated report —
 * but it is NOT a certified/third-party WCAG conformance audit: axe-core
 * itself only catches a subset (industry estimates run ~30-50%) of real
 * WCAG success criteria; a genuine conformance claim still requires manual
 * testing (keyboard-only navigation, real screen readers, color-contrast
 * edge cases axe can't infer, cognitive/timing criteria, etc). Never
 * describe this script's output as "WCAG certified" or "audited by a
 * third party" in any UI copy or docs — see src/lib/security/compliance.ts's
 * own disclaimer discipline, which this script's report also inherits.
 *
 * Usage (matches this repo's tsx CLI convention, e.g. scripts/run-backup.ts):
 *   tsx scripts/a11y-audit.ts
 *   npm run a11y:audit
 *
 * Requires a running server at A11Y_BASE_URL (default
 * http://localhost:3000) — start one with `npm run dev` first, same
 * requirement as playwright.config.ts's e2e suite.
 *
 * Crawls a small set of key routes:
 *   - "/"        the public marketing home page
 *   - "/login"   the sign-in page
 *   - "/register" the sign-up page
 *   - "/dashboard" (only if A11Y_TEST_USER_EMAIL / A11Y_TEST_USER_PASSWORD
 *     are set) — the authenticated dashboard home, reached via a real
 *     credentials sign-in through the actual login form, not a bypassed
 *     session. Skipped (with an honest note in the report) otherwise, since
 *     there's no seeded test account in this repo to sign in with by
 *     default.
 *
 * Writes a real JSON report to storage/a11y-reports/latest.json (gitignored
 * like the rest of storage/ — see .gitignore) and prints a console summary.
 * Exits 1 if any route has a "critical"-impact violation (never fabricates
 * success), 0 otherwise — mirrors scripts/run-backup.ts's own discipline.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const TEST_EMAIL = process.env.A11Y_TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.A11Y_TEST_USER_PASSWORD;

const PUBLIC_ROUTES = ["/", "/login", "/register"] as const;

export interface RouteReport {
  route: string;
  url: string;
  scanned: boolean;
  skippedReason?: string;
  violationCounts: Record<string, number>;
  violations: Array<{
    id: string;
    impact: string | null | undefined;
    description: string;
    help: string;
    helpUrl: string;
    nodeCount: number;
    targets: string[][];
  }>;
}

export interface A11yAuditReport {
  generatedAt: string;
  baseUrl: string;
  disclaimer: string;
  routes: RouteReport[];
  totalCriticalViolations: number;
  totalSeriousViolations: number;
}

function summarizeViolations(violations: Result[]): RouteReport["violations"] {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl,
    nodeCount: v.nodes.length,
    targets: v.nodes.map((n) => n.target as string[]),
  }));
}

function countByImpact(violations: Result[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const v of violations) {
    const key = v.impact ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

async function scanRoute(page: Page, route: string): Promise<RouteReport> {
  const url = new URL(route, BASE_URL).toString();
  await page.goto(url, { waitUntil: "networkidle" });
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

  return {
    route,
    url,
    scanned: true,
    violationCounts: countByImpact(results.violations),
    violations: summarizeViolations(results.violations),
  };
}

async function signInTestUser(page: Page): Promise<boolean> {
  if (!TEST_EMAIL || !TEST_PASSWORD) return false;
  await page.goto(new URL("/login", BASE_URL).toString(), { waitUntil: "networkidle" });
  await page.getByPlaceholder("Email").fill(TEST_EMAIL);
  await page.getByPlaceholder("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const routes: RouteReport[] = [];

  try {
    for (const route of PUBLIC_ROUTES) {
      console.log(`[a11y-audit] Scanning ${route} ...`);
      routes.push(await scanRoute(page, route));
    }

    if (TEST_EMAIL && TEST_PASSWORD) {
      const signedIn = await signInTestUser(page);
      if (signedIn) {
        console.log(`[a11y-audit] Scanning /dashboard (authenticated) ...`);
        routes.push(await scanRoute(page, "/dashboard"));
      } else {
        routes.push({
          route: "/dashboard",
          url: new URL("/dashboard", BASE_URL).toString(),
          scanned: false,
          skippedReason: "A11Y_TEST_USER_EMAIL/A11Y_TEST_USER_PASSWORD sign-in did not reach /dashboard.",
          violationCounts: {},
          violations: [],
        });
      }
    } else {
      routes.push({
        route: "/dashboard",
        url: new URL("/dashboard", BASE_URL).toString(),
        scanned: false,
        skippedReason:
          "Set A11Y_TEST_USER_EMAIL and A11Y_TEST_USER_PASSWORD (a real seeded account) to also scan the authenticated dashboard.",
        violationCounts: {},
        violations: [],
      });
    }
  } finally {
    await browser.close();
  }

  const totalCriticalViolations = routes.reduce((sum, r) => sum + (r.violationCounts.critical ?? 0), 0);
  const totalSeriousViolations = routes.reduce((sum, r) => sum + (r.violationCounts.serious ?? 0), 0);

  const report: A11yAuditReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    disclaimer:
      "Real, live axe-core scan of this app's actual rendered pages via @axe-core/playwright — NOT a certified/third-party WCAG conformance audit. axe-core catches only a subset of real WCAG success criteria; genuine conformance still requires manual testing (keyboard nav, screen readers, etc).",
    routes,
    totalCriticalViolations,
    totalSeriousViolations,
  };

  const reportDir = path.join(process.cwd(), "storage", "a11y-reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(path.join(reportDir, "latest.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("\n[a11y-audit] Summary:");
  for (const r of routes) {
    if (!r.scanned) {
      console.log(`  ${r.route}: SKIPPED (${r.skippedReason})`);
      continue;
    }
    const counts = r.violationCounts;
    console.log(
      `  ${r.route}: ${r.violations.length} violation type(s) — critical=${counts.critical ?? 0} serious=${counts.serious ?? 0} moderate=${counts.moderate ?? 0} minor=${counts.minor ?? 0}`,
    );
  }
  console.log(
    `\n[a11y-audit] Report written to storage/a11y-reports/latest.json (${totalCriticalViolations} critical, ${totalSeriousViolations} serious across all scanned routes).`,
  );

  if (totalCriticalViolations > 0) {
    console.error(`[a11y-audit] FAILED: ${totalCriticalViolations} critical-impact violation(s) found.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[a11y-audit] unexpected error:", error);
  process.exit(1);
});
