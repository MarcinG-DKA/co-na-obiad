import { expect, test, type Page } from "@playwright/test";

export const E2E_DATA_PREFIX = "E2E ";

interface FetchResult {
  status: number;
  body: unknown;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (typeof value !== "object" || value === null || !("data" in value) || !Array.isArray(value.data)) {
    throw new Error("Expected { data: [] } from the API");
  }
  return value.data.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
}

async function ensureAppOrigin(page: Page): Promise<void> {
  try {
    if (new URL(page.url()).protocol.startsWith("http")) {
      return;
    }
  } catch {
    // about:blank and similar are not a usable origin
  }
  await page.goto("/");
}

async function inPageFetch(page: Page, path: string, method: "GET" | "DELETE"): Promise<FetchResult> {
  return page.evaluate(
    async ({ path, method }) => {
      const response = await fetch(path, { method });
      const body: unknown = await response.json().catch(() => null);
      return { status: response.status, body };
    },
    { path, method },
  );
}

export async function sweepE2eFixtures(page: Page): Promise<void> {
  await ensureAppOrigin(page);

  const pantry = await inPageFetch(page, "/api/pantry", "GET");
  expect(pantry.status, `GET /api/pantry returned ${pantry.status}`).toBe(200);
  for (const item of asRecordArray(pantry.body)) {
    if (typeof item.id === "string" && typeof item.name === "string" && item.name.startsWith(E2E_DATA_PREFIX)) {
      const deleted = await inPageFetch(page, `/api/pantry/${item.id}`, "DELETE");
      expect([200, 404], `DELETE /api/pantry/${item.id} returned ${deleted.status}`).toContain(deleted.status);
    }
  }

  const recipes = await inPageFetch(page, "/api/recipes", "GET");
  expect(recipes.status, `GET /api/recipes returned ${recipes.status}`).toBe(200);
  for (const recipe of asRecordArray(recipes.body)) {
    if (typeof recipe.id === "string" && typeof recipe.title === "string" && recipe.title.startsWith(E2E_DATA_PREFIX)) {
      const deleted = await inPageFetch(page, `/api/recipes/${recipe.id}`, "DELETE");
      expect([200, 404], `DELETE /api/recipes/${recipe.id} returned ${deleted.status}`).toContain(deleted.status);
    }
  }
}

export function installE2eFixtureCleanup(): void {
  test.beforeEach(async ({ page }) => {
    await sweepE2eFixtures(page);
  });
  test.afterEach(async ({ page }) => {
    await sweepE2eFixtures(page);
  });
}
