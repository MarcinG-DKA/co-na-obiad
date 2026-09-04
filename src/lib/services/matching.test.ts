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

function pantry(...names: string[]): Pick<PantryItem, "name" | "quantity" | "unit">[] {
  return names.map((name) => ({ name, quantity: null, unit: null }));
}

function pantryStock(
  name: string,
  quantity: number | null,
  unit: string | null,
): Pick<PantryItem, "name" | "quantity" | "unit"> {
  return { name, quantity, unit };
}

function recipe(id: string, title: string, ...ingredientNames: string[]): RecipeWithIngredientNames {
  return { id, title, ingredients: ingredientNames.map((name) => ({ name })) };
}

function recipeWith(
  id: string,
  title: string,
  ingredients: RecipeWithIngredientNames["ingredients"],
): RecipeWithIngredientNames {
  return { id, title, ingredients };
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
      checkNames: [],
    });
    expect(ranked[1]).toMatchObject({
      score: 1 / 3,
      missingNames: ["flour", "sugar"],
      checkNames: [],
    });
  });

  it("matches Eggs to eggs case-insensitively", () => {
    const [match] = matchRecipes(pantry("Eggs"), [recipe("omelette", "Omelette", "eggs")]);
    expect(match.score).toBe(1);
    expect(match.matchedNames).toEqual(["eggs"]);
    expect(match.missingNames).toEqual([]);
    expect(match.checkNames).toEqual([]);
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
    expect(match.checkNames).toEqual([]);
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

  it("treats the ingredient as ok when units match and pantry quantity is enough", () => {
    const [match] = matchRecipes(
      [pantryStock("eggs", 6, "pcs")],
      [recipeWith("omelette", "Omelette", [{ name: "eggs", quantity: 2, unit: "pcs" }])],
    );
    expect(match).toMatchObject({ score: 1, matchedNames: ["eggs"], missingNames: [], checkNames: [] });
  });

  it("lists Missing when units match but pantry quantity is too low", () => {
    const [match] = matchRecipes(
      [pantryStock("eggs", 1, "pcs")],
      [recipeWith("omelette", "Omelette", [{ name: "eggs", quantity: 3, unit: "pcs" }])],
    );
    expect(match).toMatchObject({ score: 0, matchedNames: [], missingNames: ["eggs"], checkNames: [] });
  });

  it("lists Check when the name matches but units differ", () => {
    const [match] = matchRecipes(
      [pantryStock("eggs", 12, "g")],
      [recipeWith("omelette", "Omelette", [{ name: "eggs", quantity: 2, unit: "pcs" }])],
    );
    expect(match).toMatchObject({ score: 0.5, matchedNames: [], missingNames: [], checkNames: ["eggs"] });
  });

  it("gives a Check ingredient half the points of a full match", () => {
    const [match] = matchRecipes(
      [pantryStock("eggs", 2, "pcs"), pantryStock("milk", 200, "ml")],
      [
        recipeWith("omelette", "Omelette", [
          { name: "eggs", quantity: 2, unit: "pcs" },
          { name: "milk", quantity: 100, unit: "g" },
        ]),
      ],
    );
    expect(match.score).toBe(0.75);
    expect(match.matchedNames).toEqual(["eggs"]);
    expect(match.checkNames).toEqual(["milk"]);
  });

  it("sums pantry rows with the same name and unit", () => {
    const [match] = matchRecipes(
      [pantryStock("milk", 100, "ml"), pantryStock("milk", 150, "ml")],
      [recipeWith("drink", "Drink", [{ name: "milk", quantity: 200, unit: "ml" }])],
    );
    expect(match).toMatchObject({ score: 1, matchedNames: ["milk"], checkNames: [] });
  });

  it("lists Missing when pantry has the name and unit but no quantity to compare", () => {
    const [match] = matchRecipes(
      [pantryStock("flour", null, "g")],
      [recipeWith("cake", "Cake", [{ name: "flour", quantity: 200, unit: "g" }])],
    );
    expect(match).toMatchObject({ score: 0, checkNames: [], missingNames: ["flour"] });
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
        checkNames: [],
      },
    ]);
  });

  it("propagates loader errors", async () => {
    mockListPantry.mockRejectedValue(new Error("pantry down"));
    mockListRecipes.mockResolvedValue([]);
    await expect(listMatches(fakeClient, "hh-1")).rejects.toThrow("pantry down");
  });
});
