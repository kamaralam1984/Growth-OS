import { expect, test } from "@playwright/test";

/**
 * Real authenticated golden path through the Knowledge Base
 * (src/app/dashboard/knowledge-base/**) as the seeded fixture owner —
 * loads the article list, then creates a real article through the actual
 * "New article" form (src/app/dashboard/knowledge-base/_components/article-form.tsx),
 * which calls the real createArticle server action and writes a real row
 * via Prisma.
 */
test.describe("Knowledge Base (authenticated)", () => {
  test("article list loads for the real seeded workspace", async ({ page }) => {
    await page.goto("/dashboard/knowledge-base");

    await expect(page.getByRole("heading", { name: "Knowledge Base", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "New article" })).toBeVisible();
  });

  test("an article can be created through the real New article form", async ({ page }) => {
    await page.goto("/dashboard/knowledge-base");

    await page.getByRole("button", { name: "New article" }).click();

    const title = `Playwright KB Article ${Date.now()}`;
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByLabel("Content", { exact: true }).fill("Real content written by the CRM/KB E2E spec, not a mock.");

    await page.getByRole("button", { name: "Save article" }).click();

    // A real, successful createArticle() redirects to the new article's own
    // detail page (src/app/dashboard/knowledge-base/[id]/page.tsx), whose
    // editable title <input> (see article-editor.tsx) is pre-filled with
    // the real article.title read back from Postgres — not an optimistic
    // client-side echo. Generous timeout: this app's dev server compiles
    // routes/Server Actions on demand, and this may be the first real hit
    // on this particular action/route in the run.
    await expect(page).toHaveURL(/\/dashboard\/knowledge-base\/[a-zA-Z0-9]+$/, { timeout: 30_000 });
    await expect(page.locator("input.text-lg")).toHaveValue(title);
  });
});
