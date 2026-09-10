import type { RecipeMatch } from "@/lib/services/matching";

export type MatchListViewKind = "error" | "empty" | "list";

export function resolveMatchListView(matchCount: number, loadError: boolean): MatchListViewKind {
  if (loadError) {
    return "error";
  }
  if (matchCount === 0) {
    return "empty";
  }
  return "list";
}

export function readMatchesPayload(ok: boolean, json: { data?: RecipeMatch[]; error?: string }): RecipeMatch[] {
  if (!ok || !Array.isArray(json.data)) {
    throw new Error(json.error ?? "Could not load matches");
  }
  return json.data;
}
