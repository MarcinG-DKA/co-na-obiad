import {
  STALE_AFTER_MS,
  evaluatePantryFreshness,
  formatPantryItemNeedsReview,
  formatPantryLastUpdated,
} from "@/lib/pantry-freshness";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-07T12:00:00.000Z");

function at(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

describe("evaluatePantryFreshness", () => {
  it("treats null last-updated as empty and not stale", () => {
    expect(evaluatePantryFreshness(null, NOW)).toEqual({
      lastUpdatedAt: null,
      isEmpty: true,
      isStale: false,
    });
  });

  it("is not stale under 7 elapsed days", () => {
    const lastUpdatedAt = at(-(STALE_AFTER_MS - 60 * 60 * 1000));
    expect(evaluatePantryFreshness(lastUpdatedAt, NOW)).toEqual({
      lastUpdatedAt,
      isEmpty: false,
      isStale: false,
    });
  });

  it("is stale at exactly 7 elapsed days", () => {
    const lastUpdatedAt = at(-STALE_AFTER_MS);
    expect(evaluatePantryFreshness(lastUpdatedAt, NOW)).toEqual({
      lastUpdatedAt,
      isEmpty: false,
      isStale: true,
    });
  });

  it("is stale after 8 elapsed days", () => {
    const lastUpdatedAt = at(-8 * DAY_MS);
    expect(evaluatePantryFreshness(lastUpdatedAt, NOW).isStale).toBe(true);
  });

  it("does not treat a future timestamp as stale", () => {
    const lastUpdatedAt = at(5 * 60 * 1000);
    expect(evaluatePantryFreshness(lastUpdatedAt, NOW)).toEqual({
      lastUpdatedAt,
      isEmpty: false,
      isStale: false,
    });
  });
});

describe("formatPantryLastUpdated", () => {
  it("says the pantry is empty", () => {
    expect(formatPantryLastUpdated(evaluatePantryFreshness(null, NOW), NOW)).toBe("Pantry is empty.");
  });

  it("says updated today within 24 hours", () => {
    const freshness = evaluatePantryFreshness(at(-23 * 60 * 60 * 1000), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated today");
  });

  it("says updated 1 day ago between 24 and 48 hours", () => {
    const freshness = evaluatePantryFreshness(at(-DAY_MS), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated 1 day ago");
  });

  it("uses plural days ago at 6d23h", () => {
    const freshness = evaluatePantryFreshness(at(-(6 * DAY_MS + 23 * 60 * 60 * 1000)), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated 6 days ago");
  });

  it("uses plural days ago at exactly 7 days", () => {
    const freshness = evaluatePantryFreshness(at(-STALE_AFTER_MS), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated 7 days ago");
  });

  it("uses plural days ago at 8 days", () => {
    const freshness = evaluatePantryFreshness(at(-8 * DAY_MS), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated 8 days ago");
  });

  it("clamps a future timestamp to updated today", () => {
    const freshness = evaluatePantryFreshness(at(5 * 60 * 1000), NOW);
    expect(formatPantryLastUpdated(freshness, NOW)).toBe("Oldest item updated today");
  });
});

describe("formatPantryItemNeedsReview", () => {
  it("is silent when the item is not stale", () => {
    expect(formatPantryItemNeedsReview(at(-(STALE_AFTER_MS - 60 * 60 * 1000)), NOW)).toBeNull();
  });

  it("asks for review at exactly 7 elapsed days", () => {
    expect(formatPantryItemNeedsReview(at(-STALE_AFTER_MS), NOW)).toBe("Updated 7 days ago. Needs review.");
  });

  it("asks for review after 8 elapsed days", () => {
    expect(formatPantryItemNeedsReview(at(-8 * DAY_MS), NOW)).toBe("Updated 8 days ago. Needs review.");
  });

  it("is silent for a future timestamp", () => {
    expect(formatPantryItemNeedsReview(at(5 * 60 * 1000), NOW)).toBeNull();
  });
});
