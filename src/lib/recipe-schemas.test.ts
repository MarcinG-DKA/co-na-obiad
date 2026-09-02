import { saveRecipeSchema } from "@/lib/recipe-schemas";

const validIngredient = { name: "Salt" };

describe("saveRecipeSchema", () => {
  it("trims the title", () => {
    const parsed = saveRecipeSchema.safeParse({
      title: "  Soup  ",
      ingredients: [validIngredient],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("Soup");
    }
  });

  it("rejects an empty title", () => {
    expect(saveRecipeSchema.safeParse({ title: "", ingredients: [validIngredient] }).success).toBe(false);
    expect(saveRecipeSchema.safeParse({ title: "   ", ingredients: [validIngredient] }).success).toBe(false);
  });

  it("rejects zero ingredients", () => {
    expect(saveRecipeSchema.safeParse({ title: "Soup", ingredients: [] }).success).toBe(false);
  });

  it("rejects quantity 0 (must be positive)", () => {
    expect(
      saveRecipeSchema.safeParse({
        title: "Soup",
        ingredients: [{ name: "Water", quantity: 0, unit: "ml" }],
      }).success,
    ).toBe(false);
  });

  it("accepts a positive quantity and optional unit", () => {
    const parsed = saveRecipeSchema.safeParse({
      title: "Soup",
      ingredients: [{ name: "Water", quantity: 1, unit: "ml" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.ingredients[0]).toMatchObject({ name: "Water", quantity: 1, unit: "ml" });
    }
  });

  it("rejects a free-text unit", () => {
    expect(
      saveRecipeSchema.safeParse({
        title: "Soup",
        ingredients: [{ name: "Water", quantity: 1, unit: "L" }],
      }).success,
    ).toBe(false);
  });

  it("accepts null quantity and unit", () => {
    const parsed = saveRecipeSchema.safeParse({
      title: "Soup",
      ingredients: [{ name: "Salt", quantity: null, unit: null }],
    });
    expect(parsed.success).toBe(true);
  });

  it("defaults missing steps to an empty array", () => {
    const parsed = saveRecipeSchema.safeParse({
      title: "Soup",
      ingredients: [validIngredient],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.steps).toEqual([]);
    }
  });

  it("drops blank steps after trim", () => {
    const parsed = saveRecipeSchema.safeParse({
      title: "Soup",
      ingredients: [validIngredient],
      steps: ["  boil  ", "   ", "season"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.steps).toEqual(["boil", "season"]);
    }
  });
});
