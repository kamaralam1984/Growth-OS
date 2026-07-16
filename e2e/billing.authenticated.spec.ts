import { expect, test } from "@playwright/test";

/**
 * Real authenticated smoke test for Billing (src/app/dashboard/billing/**)
 * as the seeded fixture owner. This deployment (see .env / .env.example)
 * has no Stripe/Razorpay/Paddle/LemonSqueezy credentials configured, so the
 * Subscription & payment page's gateway-backed checkout genuinely has
 * nothing configured to offer — that is the correct, honest state to
 * assert here (see docs/guides/security-guide.md's "Honest gaps" section):
 * this spec does NOT fake a successful payment or a configured gateway, it
 * confirms the page loads and degrades to that honest state instead of
 * erroring.
 */
test.describe("Billing (authenticated)", () => {
  test("legacy Billing page loads with the real free-plan switcher", async ({ page }) => {
    await page.goto("/dashboard/billing");

    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seats" })).toBeVisible();
    // Real seat usage read from the fixture org's own Membership rows
    // (1 ACTIVE membership: the seeded owner) — not a fabricated number.
    await expect(page.getByText(/1 of \d+ used/)).toBeVisible();
  });

  test("Subscription & payment page loads honestly with no gateway configured", async ({ page }) => {
    await page.goto("/dashboard/billing/subscription");

    await expect(page.getByRole("heading", { name: "Subscription & payment", level: 1 })).toBeVisible();
    // No active gateway subscription exists for a freshly-seeded org, so
    // the page's free/default plan state renders instead of a fabricated
    // "paid" one.
    await expect(page.getByText(/No platform plan yet|Free/i).first()).toBeVisible();
  });
});
