import path from "node:path";

/**
 * Shared constants between e2e/global-setup.ts (which seeds this user/org
 * and signs in as them) and playwright.config.ts (which points the
 * `chromium-authenticated` project's storageState at the same file).
 *
 * Deliberately its own tiny, dependency-free module — playwright.config.ts
 * needs STORAGE_STATE_PATH at config-load time, and importing it directly
 * from global-setup.ts would drag that file's Prisma/Argon2/Playwright
 * browser imports into every `playwright test` invocation (including ones
 * that never run globalSetup, e.g. `--list`), which is unnecessary coupling.
 */
export const E2E_FIXTURE_EMAIL = "e2e-fixture@kvl-growthos.test";
export const E2E_FIXTURE_PASSWORD = "E2E-Fixture-Passw0rd-1!";
export const E2E_FIXTURE_ORG_SLUG = "e2e-fixture-org";

export const STORAGE_STATE_PATH = path.join(__dirname, ".auth", "user.json");
