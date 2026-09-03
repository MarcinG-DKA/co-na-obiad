import type { Database } from "@/db/database.types";
import type { PantryItem } from "@/lib/services/pantry";
import { listPantryItems } from "@/lib/services/pantry";
import type { RecipeWithIngredientNames } from "@/lib/services/recipe";
import { listRecipesWithIngredients } from "@/lib/services/recipe";
import type { SupabaseClient } from "@supabase/supabase-js";

jest.mock("@/lib/services/pantry", () => ({
  listPantryItems: jest.fn(),
}));

jest.mock("@/lib/services/recipe", () => ({
  listRecipesWithIngredients: jest.fn(),
}));

import { listMatches, matchRecipes, normalizeName } from "@/lib/services/matching";

const mockListPantry = listPantryItems as jest.MockedFunction<typeof listPantryItems>;
const mockListRecipes = listRecipesWithIngredients as jest.MockedFunction<typeof listRecipesWithIngredients>;

function pantry(...names: string[]): Pick<PantryItem, "name">[] {
  return names.map((name) => ({ name }));
}

function recipe(id: string, title: string, ...ingredientNames: string[]): RecipeWithIngredientNames {
  return { id, title, ingredients: ingredientNames.map((name) => ({ name })) };
}

const fakeClient = {} as SupabaseClient<Database>;

describe("normalizeName", () => {
  it("trims and lowercases", () => {
    expect(normalizeName("  Eggs  ")).toBe("eggs");
  });
});

describe("matchRecipes", () => {
  it("ranks omelette above cake when the pantry has eggs and milk", () => {
    const ranked = matchRecipes(pantry("eggs", "milk"), [
      recipe("cake", "Cake", "flour", "sugar", "eggs"),
      recipe("omelette", "Omelette", "eggs", "milk", "salt"),
    ]);

    expect(ranked.map((match) => match.recipeId)).toEqual(["omelette", "cake"]);
    expect(ranked[0]).toMatchObject({
      score: 2 / 3,
      missingNames: ["salt"],
    });
    expect(ranked[1]).toMatchObject({
      score: 1 / 3,
      missingNames: ["flour", "sugar"],
    });
  });

  it("matches Eggs to eggs case-insensitively", () => {
    const [match] = matchRecipes(pantry("Eggs"), [recipe("omelette", "Omelette", "eggs")]);
    expect(match.score).toBe(1);
    expect(match.matchedNames).toEqual(["eggs"]);
    expect(match.missingNames).toEqual([]);
  });

  it("trims names before comparing", () => {
    const [match] = matchRecipes(pantry("  milk  "), [recipe("drink", "Drink", "milk")]);
    expect(match.score).toBe(1);
  });

  it("scores every recipe 0 and lists all ingredients as missing when the pantry is empty", () => {
    const ranked = matchRecipes(pantry(), [
      recipe("omelette", "Omelette", "eggs", "milk"),
      recipe("cake", "Cake", "flour"),
    ]);

    expect(ranked).toHaveLength(2);
    expect(ranked.every((match) => match.score === 0)).toBe(true);
    expect(ranked.find((match) => match.recipeId === "omelette")?.missingNames).toEqual(["eggs", "milk"]);
    expect(ranked.find((match) => match.recipeId === "cake")?.missingNames).toEqual(["flour"]);
  });

  it("returns [] when there are no recipes", () => {
    expect(matchRecipes(pantry("eggs"), [])).toEqual([]);
  });

  it("does not let duplicate pantry or recipe names distort unique-set coverage", () => {
    const [match] = matchRecipes(pantry("eggs", "Eggs"), [recipe("omelette", "Omelette", "eggs", "eggs", "salt")]);
    expect(match.score).toBe(0.5);
    expect(match.matchedNames).toEqual(["eggs"]);
    expect(match.missingNames).toEqual(["salt"]);
  });

  it("scores 0 when a recipe has no usable ingredient names", () => {
    const [emptyList] = matchRecipes(pantry("eggs"), [recipe("blank", "Blank")]);
    const [whitespace] = matchRecipes(pantry("eggs"), [recipe("spaces", "Spaces", "   ")]);
    expect(emptyList.score).toBe(0);
    expect(emptyList.matchedNames).toEqual([]);
    expect(emptyList.missingNames).toEqual([]);
    expect(whitespace.score).toBe(0);
  });

  it("sorts equal scores by missing count then title", () => {
    const ranked = matchRecipes(pantry("eggs"), [
      recipe("b", "Bread", "flour"),
      recipe("s", "Soup", "water"),
      recipe("o", "Omelette", "eggs", "salt"),
    ]);

    expect(ranked.map((match) => match.title)).toEqual(["Omelette", "Bread", "Soup"]);
  });
});

describe("listMatches", () => {
  beforeEach(() => {
    mockListPantry.mockReset();
    mockListRecipes.mockReset();
  });

  it("loads pantry and recipes in parallel then returns scored matches", async () => {
    let resolvePantry!: (value: PantryItem[]) => void;
    let resolveRecipes!: (value: RecipeWithIngredientNames[]) => void;
    const pantryPromise = new Promise<PantryItem[]>((resolve) => {
      resolvePantry = resolve;
    });
    const recipesPromise = new Promise<RecipeWithIngredientNames[]>((resolve) => {
      resolveRecipes = resolve;
    });
    mockListPantry.mockReturnValue(pantryPromise);
    mockListRecipes.mockReturnValue(recipesPromise);

    const pending = listMatches(fakeClient, "hh-1");

    expect(mockListPantry).toHaveBeenCalledWith(fakeClient, "hh-1");
    expect(mockListRecipes).toHaveBeenCalledWith(fakeClient, "hh-1");

    resolvePantry([
      {
        id: "item-1",
        household_id: "hh-1",
        name: "eggs",
        quantity: null,
        unit: null,
        created_at: "2026-09-02T00:00:00Z",
        updated_at: "2026-09-02T00:00:00Z",
      },
    ]);
    resolveRecipes([recipe("omelette", "Omelette", "eggs", "salt")]);

    await expect(pending).resolves.toEqual([
      {
        recipeId: "omelette",
        title: "Omelette",
        score: 0.5,
        matchedNames: ["eggs"],
        missingNames: ["salt"],
      },
    ]);
  });

  it("propagates loader errors", async () => {
    mockListPantry.mockRejectedValue(new Error("pantry down"));
    mockListRecipes.mockResolvedValue([]);
    await expect(listMatches(fakeClient, "hh-1")).rejects.toThrow("pantry down");
  });
});
