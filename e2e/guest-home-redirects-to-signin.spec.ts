// risk: test-plan.md #3 — middleware stops gating `/` (guest reaches household page)
// seed: e2e/seed.spec.ts

import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Risk #3: session gate on `/`", () => {
  test("guest visiting home is redirected to sign-in and never sees the dashboard", async ({ page }) => {
    // Signed-out `/` is redirected before the household page runs.
    await page.goto("/");
    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

    // `/auth/signin` is not itself redirected (no guest loop).
    await page.goto("/auth/signin");
    await expect(page).toHaveURL(/\/auth\/signin$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
  });
});
