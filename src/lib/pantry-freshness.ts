export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PantryFreshness {
  lastUpdatedAt: string | null;
  isEmpty: boolean;
  isStale: boolean;
}

export interface PantryFreshnessView {
  kind: "error" | "empty" | "ok";
  showNudge: boolean;
}

function elapsedMs(lastUpdatedAt: string, now: Date): number {
  return Math.max(0, now.getTime() - Date.parse(lastUpdatedAt));
}

function elapsedDays(lastUpdatedAt: string, now: Date): number {
  return Math.floor(elapsedMs(lastUpdatedAt, now) / DAY_MS);
}

export function evaluatePantryFreshness(lastUpdatedAt: string | null, now: Date): PantryFreshness {
  if (lastUpdatedAt === null) {
    return { lastUpdatedAt: null, isEmpty: true, isStale: false };
  }

  return {
    lastUpdatedAt,
    isEmpty: false,
    isStale: elapsedMs(lastUpdatedAt, now) >= STALE_AFTER_MS,
  };
}

export function resolvePantryFreshnessView(
  lastUpdatedAt: string | null,
  loadError: boolean,
  now: Date,
): PantryFreshnessView {
  if (loadError) {
    return { kind: "error", showNudge: false };
  }

  const freshness = evaluatePantryFreshness(lastUpdatedAt, now);
  if (freshness.isEmpty) {
    return { kind: "empty", showNudge: false };
  }

  return { kind: "ok", showNudge: freshness.isStale };
}

export function formatPantryLastUpdated(freshness: PantryFreshness, now: Date): string {
  if (freshness.isEmpty || freshness.lastUpdatedAt === null) {
    return "Pantry is empty.";
  }

  const days = elapsedDays(freshness.lastUpdatedAt, now);
  if (days === 0) {
    return "Oldest item updated today";
  }
  if (days === 1) {
    return "Oldest item updated 1 day ago";
  }
  return `Oldest item updated ${days} days ago`;
}

export function formatPantryItemNeedsReview(updatedAt: string, now: Date): string | null {
  if (!evaluatePantryFreshness(updatedAt, now).isStale) {
    return null;
  }

  const days = elapsedDays(updatedAt, now);
  const when = days === 1 ? "1 day ago" : `${days} days ago`;
  return `Updated ${when}. Needs review.`;
}
