export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PantryFreshness {
  lastUpdatedAt: string | null;
  isEmpty: boolean;
  isStale: boolean;
}

function elapsedMs(lastUpdatedAt: string, now: Date): number {
  return Math.max(0, now.getTime() - Date.parse(lastUpdatedAt));
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

export function formatPantryLastUpdated(freshness: PantryFreshness, now: Date): string {
  if (freshness.isEmpty || freshness.lastUpdatedAt === null) {
    return "Pantry is empty.";
  }

  const days = Math.floor(elapsedMs(freshness.lastUpdatedAt, now) / DAY_MS);
  if (days === 0) {
    return "Updated today";
  }
  if (days === 1) {
    return "Updated 1 day ago";
  }
  return `Updated ${days} days ago`;
}
