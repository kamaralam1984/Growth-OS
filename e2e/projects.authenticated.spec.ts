import { expect, test } from "@playwright/test";

/**
 * Real authenticated golden path through Projects (src/app/dashboard/projects/**)
 * as the seeded fixture owner — loads the Projects owner dashboard, then
 * creates a real Project through the actual "New project" form
 * (src/app/dashboard/projects/_components/project-form.tsx), which calls
 * the real createProject server action and writes a real row via Prisma.
 */
test.describe("Projects (authenticated)", () => {
  test("Projects dashboard loads with real delivery metrics", async ({ page }) => {
    await page.goto("/dashboard/projects");

    await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
    await expect(page.getByText("Active projects")).toBeVisible();
    // "Critical alerts" legitimately appears twice (the metric card's label,
    // and the "Critical Risks" section header below it) — .first() just
    // confirms the page rendered, not which specific occurrence.
    await expect(page.getByText("Critical alerts", { exact: true }).first()).toBeVisible();
  });

  test("a project can be created through the real New project form", async ({ page }) => {
    await page.goto("/dashboard/projects");

    await page.getByRole("button", { name: "New project" }).click();

    const projectName = `Playwright Project ${Date.now()}`;
    await page.getByLabel("Project name", { exact: false }).fill(projectName);

    await page.getByRole("button", { name: "Create project" }).click();

    // A real, successful createProject() redirects to the new project's own
    // detail page (src/app/dashboard/projects/[id]/page.tsx), whose <h1> is
    // the real project.name read back from Postgres — not an optimistic
    // client-side echo. Generous timeout: this app's dev server compiles
    // routes/Server Actions on demand, and this may be the first real hit
    // on this particular action/route in the run.
    await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard\/projects\/[a-zA-Z0-9]+$/);
  });
});
