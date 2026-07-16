import { AxeBuilder } from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Real authenticated smoke test against the Command Center dashboard
 * (src/app/dashboard/page.tsx) — uses the genuine session
 * e2e/global-setup.ts minted by actually signing in through /login as the
 * seeded fixture owner (see E2E_FIXTURE_EMAIL in e2e/fixture-constants.ts).
 * No mocked session, no stubbed data: every number on this page is a real
 * Prisma read against the fixture org this suite provisioned.
 */
test.describe("Dashboard (authenticated)", () => {
  test("loads the Command Center with the real seeded org's data", async ({ page }) => {
    await page.goto("/dashboard");

    // The dashboard's <h1> renders the signed-in user's real active
    // organization name (see DashboardPage's `membership.organization.name`)
    // — proof this request actually resolved a real session + membership,
    // not an anonymous/redirected page.
    await expect(page.getByRole("heading", { name: "E2E Fixture Org", level: 1 })).toBeVisible();
    await expect(page.getByText("Company Health")).toBeVisible();
    await expect(page.getByText("Revenue & Pipeline")).toBeVisible();

    // A signed-out visitor hitting /dashboard is redirected to /login (see
    // requireActiveMembership in src/app/dashboard/_lib/require-membership.ts)
    // — staying on /dashboard is itself proof this is a real authenticated
    // request, not an anonymous one that silently rendered something.
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "E2E Fixture Org", level: 1 })).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

    await test.info().attach("axe-results.json", {
      body: JSON.stringify(results, null, 2),
      contentType: "application/json",
    });

    const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      seriousOrCritical,
      `Serious/critical a11y violations on /dashboard:\n${seriousOrCritical.map((v) => `- [${v.impact}] ${v.id}: ${v.help} (${v.helpUrl})`).join("\n")}`,
    ).toEqual([]);
  });
});
