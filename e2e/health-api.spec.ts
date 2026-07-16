import { expect, test } from "@playwright/test";

/**
 * Real API test against GET /api/health using Playwright's built-in
 * APIRequestContext (`request` fixture) — deliberately not a separate
 * `supertest` dependency, since Playwright already covers this.
 *
 * NOTE: /api/health is built by a parallel task (owned by
 * src/lib/monitoring/*, out of this task's scope) and did not exist yet at
 * the time this test was written. This test is written against its
 * documented contract instead of a route this task inspected directly:
 *   GET /api/health -> 200 (healthy) or 503 (degraded/unhealthy), JSON body
 *   shaped like { overall: string, components: ..., checkedAt: string }.
 * If the route still doesn't exist when this suite runs, this test will
 * fail with a 404 — that's a real, informative failure pointing at the
 * timing dependency, not a false pass.
 */
test.describe("GET /api/health", () => {
  test("returns a real JSON health payload with a 200 or 503 status", async ({ request }) => {
    const response = await request.get("/api/health");

    expect([200, 503]).toContain(response.status());

    const body = await response.json();
    expect(typeof body.overall).toBe("string");
    expect(body).toHaveProperty("components");
    expect(typeof body.checkedAt).toBe("string");
    // checkedAt must be a real, parseable timestamp, not a placeholder string.
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });
});
