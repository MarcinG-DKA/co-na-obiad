import { unitSchema } from "@/lib/units";

describe("unitSchema", () => {
  it("accepts ml, g, and pcs", () => {
    expect(unitSchema.safeParse("ml").success).toBe(true);
    expect(unitSchema.safeParse("g").success).toBe(true);
    expect(unitSchema.safeParse("pcs").success).toBe(true);
  });

  it("treats blank as null", () => {
    const parsed = unitSchema.safeParse("  ");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toBeNull();
    }
  });

  it("rejects other units", () => {
    expect(unitSchema.safeParse("L").success).toBe(false);
    expect(unitSchema.safeParse("kg").success).toBe(false);
  });
});
