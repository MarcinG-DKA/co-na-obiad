import { addPantryItemSchema, updatePantryItemSchema } from "@/lib/pantry-schemas";

describe("addPantryItemSchema", () => {
  it("accepts a name-only item", () => {
    const parsed = addPantryItemSchema.safeParse({ name: "Milk" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Milk");
    }
  });

  it("trims the name", () => {
    const parsed = addPantryItemSchema.safeParse({ name: "  Eggs  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Eggs");
    }
  });

  it("rejects an empty name", () => {
    expect(addPantryItemSchema.safeParse({ name: "" }).success).toBe(false);
    expect(addPantryItemSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects quantity 0 (must be positive)", () => {
    expect(addPantryItemSchema.safeParse({ name: "Eggs", quantity: 0 }).success).toBe(false);
  });

  it("accepts a positive quantity and optional unit", () => {
    const parsed = addPantryItemSchema.safeParse({ name: "Eggs", quantity: 12, unit: "pcs" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ name: "Eggs", quantity: 12, unit: "pcs" });
    }
  });

  it("accepts null quantity and unit", () => {
    const parsed = addPantryItemSchema.safeParse({ name: "Salt", quantity: null, unit: null });
    expect(parsed.success).toBe(true);
  });
});

describe("updatePantryItemSchema", () => {
  it("rejects an empty object", () => {
    const parsed = updatePantryItemSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe("At least one field is required");
    }
  });

  it("accepts a partial name update", () => {
    const parsed = updatePantryItemSchema.safeParse({ name: "Whole Milk" });
    expect(parsed.success).toBe(true);
  });
});
