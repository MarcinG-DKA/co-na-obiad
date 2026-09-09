import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { test as setup, expect } from "@playwright/test";

const authFile = path.join("playwright/.auth/user.json");

setup("authenticate", async ({ page }) => {
  mkdirSync(path.dirname(authFile), { recursive: true });

  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (email && password) {
    await page.goto("/auth/signin");
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("textbox", { name: "Password" }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await page.context().storageState({ path: authFile });
    return;
  }

  if (existsSync("auth.json")) {
    copyFileSync("auth.json", authFile);
    return;
  }

  throw new Error("Set E2E_EMAIL and E2E_PASSWORD, or provide a gitignored auth.json storage state.");
});
