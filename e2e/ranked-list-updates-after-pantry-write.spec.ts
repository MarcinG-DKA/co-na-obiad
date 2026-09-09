// risk: test-plan.md #5 — cook edits pantry, returns to `/`, and still sees the old ranking
// seed: e2e/seed.spec.ts

import { test, expect, type Page } from "@playwright/test";
import { installE2eFixtureCleanup } from "./cleanup";

installE2eFixtureCleanup();

interface CreatedRecipe {
  id: string;
}

async function createRecipe(page: Page, title: string, ingredientName: string): Promise<CreatedRecipe> {
  const response = await page.request.post("/api/recipes", {
    data: {
      title,
      ingredients: [{ name: ingredientName, quantity: 1, unit: "g" }],
      steps: [],
    },
  });
  await expect(response).toBeOK();
  const json: unknown = await response.json();
  if (
    typeof json !== "object" ||
    json === null ||
    !("data" in json) ||
    typeof json.data !== "object" ||
    json.data === null ||
    !("id" in json.data) ||
    typeof json.data.id !== "string"
  ) {
    throw new Error("Recipe create did not return an id");
  }
  return { id: json.data.id };
}

test.describe("Risk #5: ranked list stale after pantry write", () => {
  test("ranked list updates after pantry write when returning home", async ({ page }) => {
    const suffix = `${Date.now()}`;
    const title = `E2E Toast ${suffix}`;
    const ingredientName = `E2E Flour ${suffix}`;

    // Seed a unique recipe whose only ingredient is missing from the pantry.
    await createRecipe(page, title, ingredientName);

    // Open the ranked list and confirm the recipe is a zero-overlap miss.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: `${title} 0%` })).toBeVisible();
    await expect(page.getByText(`Missing: ${ingredientName}`)).toBeVisible();

    // Cook adds the missing ingredient on the pantry page.
    await page.getByRole("link", { name: "Pantry", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pantry" })).toBeVisible();
    const addButton = page.getByRole("button", { name: "Add item" });
    const nameInput = page.getByRole("textbox", { name: "Item name" });
    await expect(async () => {
      await nameInput.click();
      await nameInput.clear();
      await nameInput.pressSequentially(ingredientName);
      await expect(addButton).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("spinbutton", { name: "Quantity" }).fill("1");
    await page.getByLabel("Unit").selectOption("g");
    const saved = page.waitForResponse((response) => {
      return new URL(response.url()).pathname === "/api/pantry" && response.request().method() === "POST";
    });
    await addButton.click();
    expect((await saved).ok()).toBeTruthy();
    await expect(page.getByText(ingredientName, { exact: true })).toBeVisible();

    // Return to `/` (next ranked-list load) and confirm scores/missing names changed.
    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: `${title} 100%` })).toBeVisible();
    await expect(page.getByRole("link", { name: `${title} 0%` })).toHaveCount(0);
    await expect(page.getByText(`Missing: ${ingredientName}`)).toHaveCount(0);
  });
});
