import { test, expect } from "@playwright/test";
import { E2E_DATA_PREFIX, installE2eFixtureCleanup } from "./cleanup";

installE2eFixtureCleanup();

test.describe("Ranked list refetch error", () => {
  test("failed matches refetch shows an error instead of a healthy ranked list", async ({ page }) => {
    const suffix = `${Date.now()}`;
    const title = `${E2E_DATA_PREFIX}Refetch ${suffix}`;
    const ingredientName = `${E2E_DATA_PREFIX}Egg ${suffix}`;

    const created = await page.request.post("/api/recipes", {
      data: {
        title,
        ingredients: [{ name: ingredientName, quantity: 1, unit: "g" }],
        steps: [],
      },
    });
    await expect(created).toBeOK();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: `${title} 0%` })).toBeVisible();

    await page.route("**/api/matches", async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Could not load matches" }),
      });
    });

    const failed = page.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/matches";
    });
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect((await failed).ok()).toBeFalsy();

    await expect(page.getByText("Could not load matches.")).toBeVisible();
    await expect(page.getByRole("link", { name: `${title} 0%` })).toHaveCount(0);
    await expect(page.getByText("No recipes yet. Add one to start the household library.")).toHaveCount(0);
  });
});
