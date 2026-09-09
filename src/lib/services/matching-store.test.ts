import { listMatches } from "@/lib/services/matching";
import { addPantryItem } from "@/lib/services/pantry";
import { saveRecipe } from "@/lib/services/recipe";
import { createSupabaseFake } from "@/test/supabase-fake";

describe("listMatches against a two-household store", () => {
  it("does not include household B recipe titles when listing as A", async () => {
    const client = createSupabaseFake({
      pantryItems: [
        { id: "a-bread", household_id: "hh-A", name: "bread" },
        { id: "b-beans", household_id: "hh-B", name: "beans" },
      ],
      recipes: [
        {
          id: "a-toast",
          household_id: "hh-A",
          title: "Toast",
          ingredients: [{ name: "bread" }],
        },
        {
          id: "b-chili",
          household_id: "hh-B",
          title: "Household B Chili",
          ingredients: [{ name: "beans" }],
        },
      ],
    });

    const matches = await listMatches(client, "hh-A");

    expect(matches.map((match) => match.recipeId)).toEqual(["a-toast"]);
    expect(matches.map((match) => match.title)).toEqual(["Toast"]);
  });
});

function omeletteWithMissingSalt() {
  return createSupabaseFake({
    pantryItems: [{ id: "a-eggs", household_id: "hh-A", name: "eggs" }],
    recipes: [
      {
        id: "a-omelette",
        household_id: "hh-A",
        title: "Omelette",
        steps: ["cook"],
        ingredients: [{ name: "eggs" }, { name: "salt" }],
      },
    ],
  });
}

function omeletteMatch(matches: Awaited<ReturnType<typeof listMatches>>) {
  const match = matches.find((entry) => entry.recipeId === "a-omelette");
  if (!match) {
    throw new Error("expected Omelette in ranked list");
  }
  return match;
}

describe("listMatches after a pantry write", () => {
  it("drops salt from missingNames and raises score after adding salt", async () => {
    const client = omeletteWithMissingSalt();

    const before = omeletteMatch(await listMatches(client, "hh-A"));
    expect(before.missingNames).toEqual(["salt"]);

    await addPantryItem(client, "hh-A", { name: "salt" });

    const after = omeletteMatch(await listMatches(client, "hh-A"));
    expect(after.missingNames).toEqual([]);
    expect(after.score).toBeGreaterThan(before.score);
  });
});

describe("listMatches after a recipe write", () => {
  it("drops salt from missingNames and raises score after saving without salt", async () => {
    const client = omeletteWithMissingSalt();

    const before = omeletteMatch(await listMatches(client, "hh-A"));
    expect(before.missingNames).toEqual(["salt"]);

    await saveRecipe(
      client,
      "hh-A",
      {
        title: "Omelette",
        steps: ["cook"],
        ingredients: [{ name: "eggs" }],
      },
      "a-omelette",
    );

    const after = omeletteMatch(await listMatches(client, "hh-A"));
    expect(after.missingNames).toEqual([]);
    expect(after.score).toBeGreaterThan(before.score);
  });
});
