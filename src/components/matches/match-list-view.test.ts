import { readMatchesPayload, resolveMatchListView } from "./match-list-view";
import type { RecipeMatch } from "@/lib/services/matching";

const sample: RecipeMatch = {
  recipeId: "omelette",
  title: "Omelette",
  score: 0.5,
  matchedNames: ["eggs"],
  missingNames: ["salt"],
  checkNames: [],
};

describe("resolveMatchListView", () => {
  it("treats a load error as error even when matches are already on screen", () => {
    expect(resolveMatchListView(3, true)).toBe("error");
  });

  it("shows the empty library only when the load succeeded", () => {
    expect(resolveMatchListView(0, false)).toBe("empty");
  });

  it("does not treat a failed empty load as an empty library", () => {
    expect(resolveMatchListView(0, true)).toBe("error");
  });

  it("shows the ranked list when the load succeeded with rows", () => {
    expect(resolveMatchListView(1, false)).toBe("list");
  });
});

describe("readMatchesPayload", () => {
  it("returns data on a successful envelope", () => {
    expect(readMatchesPayload(true, { data: [sample] })).toEqual([sample]);
  });

  it("throws the API error when the response is not ok", () => {
    expect(() => readMatchesPayload(false, { error: "Could not load matches" })).toThrow("Could not load matches");
  });

  it("throws when a 200 is missing data instead of treating it as an empty library", () => {
    expect(() => readMatchesPayload(true, {})).toThrow("Could not load matches");
  });

  it("returns an empty array when the load succeeded with no recipes", () => {
    expect(readMatchesPayload(true, { data: [] })).toEqual([]);
  });
});
