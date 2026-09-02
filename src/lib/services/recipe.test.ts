import { getRecipe, listRecipes, RecipeNotFoundError, removeRecipe, saveRecipe } from "@/lib/services/recipe";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

function createQueryBuilder(result: QueryResult) {
  const eq = jest.fn();
  const order = jest.fn();
  const select = jest.fn();
  const del = jest.fn();
  const single = jest.fn();

  const builder: {
    select: (...args: unknown[]) => unknown;
    delete: (...args: unknown[]) => unknown;
    eq: (...args: unknown[]) => unknown;
    order: (...args: unknown[]) => unknown;
    single: () => Promise<QueryResult>;
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {
    select: (...args: unknown[]) => {
      select(...args);
      return builder;
    },
    delete: (...args: unknown[]) => {
      del(...args);
      return builder;
    },
    eq: (...args: unknown[]) => {
      eq(...args);
      return builder;
    },
    order: (...args: unknown[]) => {
      order(...args);
      return builder;
    },
    single: () => {
      single();
      return Promise.resolve(result);
    },
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return { builder, eq, order, select, delete: del, single };
}

function createClient(fromResult: QueryResult, rpcResult?: QueryResult) {
  const query = createQueryBuilder(fromResult);
  const from = jest.fn(() => query.builder);
  const rpc = jest.fn().mockResolvedValue(rpcResult ?? { data: null, error: null });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from, rpc, query };
}

const listRow = {
  id: "recipe-1",
  household_id: "hh-1",
  title: "Soup",
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  recipe_ingredients: [{ count: 2 }],
};

const detailRow = {
  id: "recipe-1",
  household_id: "hh-1",
  title: "Soup",
  steps: ["boil", "season"],
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  recipe_ingredients: [
    {
      id: "ing-2",
      name: "salt",
      quantity: null,
      unit: null,
      position: 1,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    },
    {
      id: "ing-1",
      name: "water",
      quantity: 1,
      unit: "L",
      position: 0,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    },
  ],
};

const saveInput = {
  title: "Soup",
  steps: ["boil"],
  ingredients: [{ name: "water", quantity: 1, unit: "L" }],
};

describe("listRecipes", () => {
  it("returns list items with ingredient_count ordered by created_at", async () => {
    const { client, from, query } = createClient({ data: [listRow], error: null });
    await expect(listRecipes(client, "hh-1")).resolves.toEqual([
      {
        id: "recipe-1",
        household_id: "hh-1",
        title: "Soup",
        created_at: "2026-09-02T00:00:00Z",
        updated_at: "2026-09-02T00:00:00Z",
        ingredient_count: 2,
      },
    ]);
    expect(from).toHaveBeenCalledWith("recipes");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("returns [] when there are no recipes", async () => {
    const { client } = createClient({ data: [], error: null });
    await expect(listRecipes(client, "hh-1")).resolves.toEqual([]);
  });

  it("throws on a PostgREST error instead of returning []", async () => {
    const { client } = createClient({ data: null, error: { message: "boom" } });
    await expect(listRecipes(client, "hh-1")).rejects.toThrow("boom");
  });
});

describe("getRecipe", () => {
  it("returns a recipe with ingredients ordered by position", async () => {
    const { client, query } = createClient({ data: detailRow, error: null });
    const recipe = await getRecipe(client, "recipe-1", "hh-1");
    expect(recipe.ingredients.map((ingredient) => ingredient.name)).toEqual(["water", "salt"]);
    expect(query.eq).toHaveBeenCalledWith("id", "recipe-1");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
    expect(query.order).toHaveBeenCalledWith("position", { referencedTable: "recipe_ingredients", ascending: true });
  });

  it("throws RecipeNotFoundError when .single() finds no row", async () => {
    const { client } = createClient({ data: null, error: { message: "not found", code: "PGRST116" } });
    await expect(getRecipe(client, "missing", "hh-1")).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});

describe("saveRecipe", () => {
  it("calls rpc with household id and payload then reloads the recipe", async () => {
    const { client, rpc, from } = createClient({ data: detailRow, error: null }, { data: "recipe-1", error: null });
    const recipe = await saveRecipe(client, "hh-1", saveInput);
    expect(rpc).toHaveBeenCalledWith("save_recipe", {
      p_household_id: "hh-1",
      p_recipe_id: null,
      p_title: "Soup",
      p_steps: ["boil"],
      p_ingredients: [{ name: "water", quantity: 1, unit: "L" }],
    });
    expect(from).toHaveBeenCalledWith("recipes");
    expect(recipe.id).toBe("recipe-1");
  });

  it("passes recipeId through on update", async () => {
    const { client, rpc } = createClient({ data: detailRow, error: null }, { data: "recipe-1", error: null });
    await saveRecipe(client, "hh-1", saveInput, "recipe-1");
    expect(rpc).toHaveBeenCalledWith(
      "save_recipe",
      expect.objectContaining({
        p_household_id: "hh-1",
        p_recipe_id: "recipe-1",
      }),
    );
  });

  it("throws RecipeNotFoundError when the RPC reports a missing recipe", async () => {
    const { client } = createClient(
      { data: null, error: null },
      { data: null, error: { message: "Recipe not found" } },
    );
    await expect(saveRecipe(client, "hh-1", saveInput, "missing")).rejects.toBeInstanceOf(RecipeNotFoundError);
  });

  it("throws on other RPC errors", async () => {
    const { client } = createClient(
      { data: null, error: null },
      { data: null, error: { message: "Ingredients required" } },
    );
    await expect(saveRecipe(client, "hh-1", saveInput)).rejects.toThrow("Ingredients required");
  });
});

describe("removeRecipe", () => {
  it("throws RecipeNotFoundError when count is 0", async () => {
    const { client, query } = createClient({ data: null, error: null, count: 0 });
    await expect(removeRecipe(client, "recipe-1", "hh-1")).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(query.delete).toHaveBeenCalledWith({ count: "exact" });
    expect(query.eq).toHaveBeenCalledWith("id", "recipe-1");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
  });

  it("resolves when a row is deleted", async () => {
    const { client } = createClient({ data: null, error: null, count: 1 });
    await expect(removeRecipe(client, "recipe-1", "hh-1")).resolves.toBeUndefined();
  });
});
