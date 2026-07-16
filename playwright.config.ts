import { defineConfig, devices } from "@playwright/test";

/**
 * Real Playwright E2E/API config — boots this app itself (`next dev` locally,
 * `next start` against a real production build in CI, see the `webServer`
 * block below) and runs tests against it at http://localhost:3000. No mocked
 * server, no fixture app — genuinely drives this Next.js app.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 30_000,

  // Visual-regression baselines (toHaveScreenshot()) — see
  // e2e/visual-regression.spec.ts. CSS animations/transitions are frozen
  // before every screenshot (Playwright's `animations: "disabled"`) and a
  // small pixel-diff tolerance absorbs real, harmless font-rendering/subpixel
  // differences across machines without masking a genuine visual regression.
  // Baselines live alongside their spec under e2e/*-snapshots/ (Playwright's
  // default snapshotPathTemplate), committed to the repo like any other test
  // fixture.
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    },
  },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Boots a real server for the test run — `next start` in CI (against the
  // real production build produced by `npm run build`), `next dev` locally
  // so `npm run test:e2e` works standalone during development. Requires the
  // same minimal real env (DATABASE_URL/AUTH_SECRET/REDIS_URL) as the app
  // itself — see .env.example and .github/workflows/ci.yml.
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
