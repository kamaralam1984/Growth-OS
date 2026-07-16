import { expect, test } from "@playwright/test";

/**
 * Real Playwright visual-regression baselines (toHaveScreenshot()) — pixel
 * snapshots of actual rendered pages, diffed against committed baseline
 * PNGs under e2e/visual-regression.spec.ts-snapshots/ on every run.
 * `maxDiffPixelRatio`/`animations: "disabled"` are configured once in
 * playwright.config.ts's `expect.toHaveScreenshot` rather than repeated here.
 *
 * Only two pages are covered, deliberately: this app's marketing home page
 * (src/app/page.tsx) mounts several `framer-motion` entrance/scroll reveals
 * AND at least one truly infinite `animate` loop (see src/animations.ts's
 * `glowPulse`, `repeat: Infinity`) — Playwright's `animations: "disabled"`
 * only freezes CSS animations/transitions, not JS-driven motion values like
 * these, so a full-page screenshot of that page would never be
 * deterministic no matter how long a test waited. /login and /register are
 * the two key pages in this app's real, unauthenticated auth flow that only
 * animate a single non-repeating entrance fade (see src/app/register/page.tsx's
 * one `motion.div variants={fadeInUp}`), so waiting for that one transition
 * to finish is enough to make them genuinely stable across runs.
 */
test.describe("Visual regression", () => {
  test("login page matches its baseline", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sign in to GrowthOS" })).toBeVisible();

    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  test("register page matches its baseline", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible();

    // The page's one entrance animation (a 0.6s fadeInUp on the whole form
    // card, see src/app/register/page.tsx) needs to finish before the
    // screenshot is deterministic — it doesn't repeat, so a fixed wait past
    // its duration is enough, unlike the home page's infinite glow pulse.
    await page.waitForTimeout(1000);

    await expect(page).toHaveScreenshot("register.png", { fullPage: true });
  });
});
