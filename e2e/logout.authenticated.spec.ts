import { expect, test } from "@playwright/test";

/**
 * Real logout flow through the actual Profile menu
 * (src/app/dashboard/_components/profile-menu.tsx), which submits a real
 * form action to signOutAction() (src/app/dashboard/actions.ts -> next-auth
 * signOut()) — a genuine session invalidation, not a manually-cleared
 * cookie. Verifies the resulting session is actually gone by then
 * confirming a protected route bounces back to /login.
 */
test.describe("Logout (authenticated)", () => {
  test("signing out clears the real session and locks out /dashboard again", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "E2E Fixture Org", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();

    // Real next-auth signOut() redirects to /login (see signOutAction's
    // `redirectTo: "/login"`).
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Proof this was a genuine session invalidation, not just a client-side
    // navigation: a fresh request to a protected route now bounces back to
    // /login via requireActiveMembership's real auth() check, instead of
    // still rendering the dashboard.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
