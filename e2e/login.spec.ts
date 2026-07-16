import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Real smoke test against the actual public login page
 * (src/app/login/page.tsx) — no mocked routes, no fabricated fixture page.
 * Requires a running server (see playwright.config.ts's `webServer`) backed
 * by a real Postgres via DATABASE_URL, since the credentials sign-in path
 * genuinely queries the database.
 */
test.describe("Login page", () => {
  test("loads with a real email/password form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "Sign in to GrowthOS" })).toBeVisible();

    const emailInput = page.getByPlaceholder("Email");
    const passwordInput = page.getByPlaceholder("Password");
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows a real validation error on bad credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("Email").fill(`nonexistent-${Date.now()}@example.com`);
    await page.getByPlaceholder("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Real next-auth credentials round trip — the app maps a failed
    // authorize() into "Invalid email or password." (see
    // src/app/login/page.tsx's handleSubmit), never silently redirecting.
    await expect(page.getByText(/invalid email or password/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to GrowthOS" })).toBeVisible();

    // Real axe-core scan (WCAG 2.0/2.1 A+AA rule sets) against the actual
    // rendered DOM — not a mocked/stubbed page. `minor`/`moderate` findings
    // are reported for visibility (see the attachment below) but only
    // `serious`/`critical` impact violations fail the build: those are the
    // ones that genuinely block a user from completing the sign-in flow
    // (e.g. a form control with no accessible name), not cosmetic contrast
    // nitpicks that a real a11y audit would triage separately.
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

    await test.info().attach("axe-results.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });

    const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      seriousOrCritical,
      `Serious/critical a11y violations on /login:\n${seriousOrCritical.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})`).join("\n")}`,
    ).toEqual([]);
  });
});
