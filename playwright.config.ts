import { defineConfig, devices } from "@playwright/test";

import { STORAGE_STATE_PATH } from "./e2e/fixture-constants";

// Real Playwright E2E/API config — boots this app itself (`next dev`
// locally, `next start` against a real production build in CI, see the
// `webServer` block below) and runs tests against it. No mocked server, no
// fixture app — genuinely drives this Next.js app.
//
// Port is overridable via PLAYWRIGHT_PORT (defaults to 3000, unchanged from
// before) purely so local runs on a shared dev host can dodge an unrelated
// process already bound to :3000 — CI and any normal single-project
// checkout never need to set this.
const PORT = process.env.PLAYWRIGHT_PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Real Playwright E2E/API config — see BASE_URL above.
 */
export default defineConfig({
  testDir: "./e2e",
  // Seeds a real, fully-onboarded fixture org/user directly via Prisma
  // (bypassing the multi-step /onboarding wizard UI for speed — a standard
  // E2E pattern, not a fake auth bypass) and then signs in through the
  // actual /login page + real next-auth credentials flow, saving the
  // resulting genuine session as storageState for the `chromium-authenticated`
  // project below. See e2e/global-setup.ts.
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  // 60s (was 30s): the new `chromium-authenticated` specs exercise real
  // Server Actions (create contact/project/article) against a dev server
  // compiling routes/actions on demand — a genuinely slower round trip than
  // the existing static-page specs, which still comfortably finish well
  // under this.
  timeout: 60_000,

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
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Unauthenticated specs (login, home page, health API, visual
      // baselines) — must NOT match authenticated specs, since those need
      // globalSetup's storageState below.
      testIgnore: /\.authenticated\.spec\.ts$/,
    },
    {
      name: "chromium-authenticated",
      use: {
        ...devices["Desktop Chrome"],
        // Reuses the real session globalSetup minted by actually signing
        // in through /login — see e2e/global-setup.ts. Every page.goto()
        // in these specs is a genuinely authenticated request, not a
        // mocked/injected session.
        storageState: STORAGE_STATE_PATH,
      },
      testMatch: /\.authenticated\.spec\.ts$/,
    },
  ],

  // Boots a real server for the test run — `next start` in CI (against the
  // real production build produced by `npm run build`), `next dev` locally
  // so `npm run test:e2e` works standalone during development. Requires the
  // same minimal real env (DATABASE_URL/AUTH_SECRET/REDIS_URL) as the app
  // itself — see .env.example and .github/workflows/ci.yml.
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT },
  },
});
