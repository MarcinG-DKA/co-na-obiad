import { listMatches } from "@/lib/services/matching";
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
