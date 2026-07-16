import { expect, test } from "@playwright/test";

/**
 * Real authenticated golden path through the CRM module
 * (src/app/dashboard/crm/**) as the seeded fixture owner — loads the CRM
 * dashboard, then creates a real Contact through the actual "Add contact"
 * form (src/app/dashboard/crm/_components/crm-contact-form.tsx), which
 * calls the real createContact server action and writes a real row via
 * Prisma. No mocked network responses.
 */
test.describe("CRM (authenticated)", () => {
  test("CRM dashboard loads with real pipeline metrics", async ({ page }) => {
    await page.goto("/dashboard/crm");

    await expect(page.getByRole("heading", { name: "CRM Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByText("Today's leads")).toBeVisible();
    // exact: true — "Pipeline value" is also a substring of the separate
    // "Open pipeline value" metric label on this page, so a non-exact match
    // is ambiguous (strict-mode violation).
    await expect(page.getByText("Pipeline value", { exact: true })).toBeVisible();
  });

  test("a contact can be created through the real Add contact form", async ({ page }) => {
    await page.goto("/dashboard/crm/contacts");
    await expect(page.getByRole("heading", { name: "Contacts", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Add contact" }).click();

    const uniqueSuffix = Date.now();
    const firstName = "Playwright";
    const lastName = `Contact${uniqueSuffix}`;
    const email = `playwright-contact-${uniqueSuffix}@kvl-growthos.test`;

    await page.getByLabel("First name", { exact: true }).fill(firstName);
    await page.getByLabel("Last name", { exact: false }).fill(lastName);
    await page.getByLabel("Business email", { exact: false }).fill(email);

    await page.getByRole("button", { name: "Save contact" }).click();

    // A real, successful createContact() closes the form and the page
    // re-fetches (router.refresh()) — the new contact shows up in the real
    // list rendered from Postgres, not an optimistic client-side echo.
    await expect(page.getByRole("button", { name: "Add contact" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible({ timeout: 10_000 });
  });
});
