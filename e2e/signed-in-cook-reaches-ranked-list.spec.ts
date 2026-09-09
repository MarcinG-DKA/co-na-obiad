// risk: test-plan.md #3 — signed-in cook is bounced through a redirect loop
// seed: e2e/seed.spec.ts

import { test, expect } from "@playwright/test";

test.describe("Risk #3: session gate on `/`", () => {
  test("signed-in cook reaches the ranked list without a redirect loop", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    await page.goto("/");
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
