import { test, expect } from "@playwright/test";
import { installE2eFixtureCleanup } from "./cleanup";

installE2eFixtureCleanup();

test("added pantry item persists after page reload", async ({ page }) => {
  const itemName = `E2E Seed Item ${Date.now()}`;

  await page.goto("/pantry");
  await expect(page.getByRole("heading", { name: "Pantry" })).toBeVisible();

  const addButton = page.getByRole("button", { name: "Add item" });
  const nameInput = page.getByRole("textbox", { name: "Item name" });
  await expect(async () => {
    await nameInput.click();
    await nameInput.clear();
    await nameInput.pressSequentially(itemName);
    await expect(addButton).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const saved = page.waitForResponse((response) => {
    return new URL(response.url()).pathname === "/api/pantry" && response.request().method() === "POST";
  });
  await addButton.click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Pantry" })).toBeVisible();
  await expect(page.getByText(itemName, { exact: true })).toBeVisible();
});
