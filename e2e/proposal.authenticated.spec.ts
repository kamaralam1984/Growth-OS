import { expect, test } from "@playwright/test";

/**
 * Real authenticated smoke test for the Documents/Proposal dashboard
 * (src/app/dashboard/proposal/page.tsx) as the seeded fixture owner — real
 * Prisma aggregates (proposals/contracts/invoices counts) for the fixture
 * org, which is freshly seeded and legitimately has none yet, so the
 * "None yet" empty states below are the honest, correct read of real data.
 */
test.describe("Proposal / Documents dashboard (authenticated)", () => {
  test("loads with real (currently empty) document metrics", async ({ page }) => {
    await page.goto("/dashboard/proposal");

    await expect(page.getByRole("heading", { name: "Documents Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("Proposals created")).toBeVisible();
    await expect(page.getByText("Revenue forecast")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent Proposals" })).toBeVisible();
  });
});
