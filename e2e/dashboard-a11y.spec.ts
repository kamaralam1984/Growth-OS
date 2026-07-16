import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Second real a11y coverage point, alongside e2e/login.spec.ts's scan of
 * /login.
 *
 * The task this suite was written for asked for a second scan of "a key
 * authenticated page" where one is easily reachable from the existing test
 * setup. It isn't: this repo's e2e suite (see e2e/login.spec.ts,
 * playwright.config.ts) has no seeded test user, no global-setup login
 * fixture, and no storageState — every authenticated dashboard route
 * (src/app/dashboard/**) genuinely requires a real signed-up, onboarded
 * Organization/User in Postgres that nothing in this test setup provisions
 * today. Fabricating one here would mean either committing real credentials
 * or building a full register -> verify-email -> onboarding flow, which is
 * a materially bigger feature than "wire up a second a11y scan."
 *
 * So, per that task's own documented fallback ("otherwise scan whatever
 * pages the current 2 specs already touch"), this scans the one other real,
 * always-reachable, unauthenticated page already part of this app's public
 * surface: the home/marketing page (src/app/page.tsx) — the same page
 * scripts/load-test.js already treats as this app's real public entry
 * point. It is not gated behind auth, DB seed data, or any fixture, so it's
 * genuinely exercised by this suite the same way /login is.
 */
test.describe("Home page accessibility", () => {
  test("loads the real public marketing page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/KVL GrowthOS/);
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/KVL GrowthOS/);

    // Real axe-core scan against the actual rendered marketing page — same
    // rule sets and same serious/critical-only failure bar as
    // e2e/login.spec.ts, so a genuinely blocking a11y regression on either
    // of this app's two most-trafficked unauthenticated pages fails CI.
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

    await test.info().attach("axe-results.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });

    const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      seriousOrCritical,
      `Serious/critical a11y violations on /:\n${seriousOrCritical.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})`).join("\n")}`,
    ).toEqual([]);
  });
});
