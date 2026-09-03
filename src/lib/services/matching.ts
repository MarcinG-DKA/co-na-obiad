import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { listPantryItems } from "@/lib/services/pantry";
import type { PantryItem } from "@/lib/services/pantry";
import { listRecipesWithIngredients } from "@/lib/services/recipe";
import type { RecipeWithIngredientNames } from "@/lib/services/recipe";

type AppSupabaseClient = SupabaseClient<Database>;

export interface RecipeMatch {
  recipeId: string;
  title: string;
  score: number;
  matchedNames: string[];
  missingNames: string[];
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function firstOccurrenceByNormalizedName(names: string[]): Map<string, string> {
  const byNormalized = new Map<string, string>();
  for (const name of names) {
    const normalized = normalizeName(name);
    if (normalized === "" || byNormalized.has(normalized)) {
      continue;
    }
    byNormalized.set(normalized, name);
  }
  return byNormalized;
}

export function matchRecipes(pantry: Pick<PantryItem, "name">[], recipes: RecipeWithIngredientNames[]): RecipeMatch[] {
  const pantryNames = new Set(pantry.map((item) => normalizeName(item.name)).filter((name) => name !== ""));

  const matches = recipes.map((recipe) => {
    const recipeNames = firstOccurrenceByNormalizedName(recipe.ingredients.map((ingredient) => ingredient.name));
    const matchedNames: string[] = [];
    const missingNames: string[] = [];

    for (const [normalized, original] of recipeNames) {
      if (pantryNames.has(normalized)) {
        matchedNames.push(original);
      } else {
        missingNames.push(original);
      }
    }

    const uniqueCount = recipeNames.size;
    const score = uniqueCount === 0 ? 0 : matchedNames.length / uniqueCount;

    return {
      recipeId: recipe.id,
      title: recipe.title,
      score,
      matchedNames,
      missingNames,
    };
  });

  return matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.missingNames.length !== b.missingNames.length) {
      return a.missingNames.length - b.missingNames.length;
    }
    return a.title.localeCompare(b.title);
  });
}

export async function listMatches(supabase: AppSupabaseClient, householdId: string): Promise<RecipeMatch[]> {
  const [pantry, recipes] = await Promise.all([
    listPantryItems(supabase, householdId),
    listRecipesWithIngredients(supabase, householdId),
  ]);
  return matchRecipes(pantry, recipes);
}
