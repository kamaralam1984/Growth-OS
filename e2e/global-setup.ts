import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { chromium, type FullConfig } from "@playwright/test";

import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD, STORAGE_STATE_PATH } from "./fixture-constants";

/**
 * Playwright globalSetup for the `chromium-authenticated` project (see
 * playwright.config.ts): seeds a real, fully-onboarded fixture org/user
 * (e2e/seed-fixture.ts) directly via Prisma — bypassing the multi-step
 * /onboarding wizard UI for speed and reliability, a completely standard
 * E2E pattern, NOT a fake/mocked auth bypass — then drives the actual
 * /login page (a real next-auth credentials round trip, with a password
 * hashed by this app's own real hashPassword()/Argon2) to mint a genuine
 * session, and saves it as reusable storageState for every spec in that
 * project. Nothing about "is this a genuine account with a genuine
 * session" is faked.
 *
 * The seed step runs in a separate `tsx` child process (e2e/seed-fixture.ts)
 * rather than importing Prisma directly in this file: this app's generated
 * Prisma client (src/generated/prisma/client.ts) is ESM-only (it uses
 * `import.meta.url`), which genuinely conflicts with Playwright Test's own
 * CJS-by-default transform for config/globalSetup files — running the seed
 * under `tsx` (already a devDependency, ESM-aware) sidesteps that without
 * changing this package's module format for unrelated code.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  execFileSync("npx", ["tsx", path.join(__dirname, "seed-fixture.ts")], {
    stdio: "inherit",
    cwd: path.join(__dirname, ".."),
  });

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/login`);
    await page.getByPlaceholder("Email").fill(E2E_FIXTURE_EMAIL);
    await page.getByPlaceholder("Password").fill(E2E_FIXTURE_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // A genuinely successful real sign-in redirects off /login to /dashboard
    // (see src/app/login/page.tsx's handleSubmit) — waiting for that URL
    // change is proof of a real, working session, not an assumption. Long
    // timeout: this is very likely the very first request to compile
    // /dashboard's route tree in dev mode (Turbopack/webpack on-demand
    // compilation of a large page), which can genuinely take well over 20s
    // on a cold start — matching the generous `webServer.timeout` below for
    // the same reason.
    await page.waitForURL(`${baseURL}/dashboard`, { timeout: 60_000 });

    // Pre-warm every route the authenticated specs hit, one at a time,
    // *before* the parallel test run starts. In dev mode (Turbopack/webpack
    // on-demand compilation), the first request to a given route compiles
    // it from scratch — genuinely slow on a large app, and multiple spec
    // files hitting different never-before-compiled routes at once (2
    // parallel workers) can queue up past a single test's own timeout. None
    // of this is needed against a real production build (`next start` in
    // CI, see webServer below), where every route is already compiled —
    // these requests just add a little, harmless extra setup time there.
    for (const route of [
      "/dashboard/crm",
      "/dashboard/crm/contacts",
      "/dashboard/projects",
      "/dashboard/knowledge-base",
      "/dashboard/billing",
      "/dashboard/billing/subscription",
      "/dashboard/proposal",
    ]) {
      await page.goto(`${baseURL}${route}`, { timeout: 60_000 });
    }

    fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}
