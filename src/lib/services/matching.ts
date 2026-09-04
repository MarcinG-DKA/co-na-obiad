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
  checkNames: string[];
}

type PantryStock = Pick<PantryItem, "name" | "quantity" | "unit">;
type RecipeNeed = RecipeWithIngredientNames["ingredients"][number];

interface GroupedNeed {
  original: string;
  quantity: number | null;
  unit: string | null;
  mixedUnits: boolean;
}

interface UnitBucket {
  sum: number;
  hasNumeric: boolean;
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function unitKey(unit: string | null | undefined): string {
  return unit ?? "";
}

function groupRecipeNeeds(ingredients: RecipeNeed[]): GroupedNeed[] {
  const byNormalized = new Map<string, GroupedNeed>();
  for (const ingredient of ingredients) {
    const normalized = normalizeName(ingredient.name);
    if (normalized === "") {
      continue;
    }
    const unit = ingredient.unit ?? null;
    const quantity = ingredient.quantity ?? null;
    const existing = byNormalized.get(normalized);
    if (!existing) {
      byNormalized.set(normalized, { original: ingredient.name, quantity, unit, mixedUnits: false });
      continue;
    }
    if (existing.unit !== unit) {
      existing.mixedUnits = true;
      continue;
    }
    if (quantity != null) {
      existing.quantity = (existing.quantity ?? 0) + quantity;
    }
  }
  return [...byNormalized.values()];
}

function groupPantryByName(pantry: PantryStock[]): Map<string, Map<string, UnitBucket>> {
  const byName = new Map<string, Map<string, UnitBucket>>();
  for (const item of pantry) {
    const normalized = normalizeName(item.name);
    if (normalized === "") {
      continue;
    }
    let byUnit = byName.get(normalized);
    if (!byUnit) {
      byUnit = new Map();
      byName.set(normalized, byUnit);
    }
    const key = unitKey(item.unit);
    const bucket = byUnit.get(key) ?? { sum: 0, hasNumeric: false };
    if (item.quantity != null) {
      bucket.sum += item.quantity;
      bucket.hasNumeric = true;
    }
    byUnit.set(key, bucket);
  }
  return byName;
}

function classifyNeed(need: GroupedNeed, pantryUnits: Map<string, UnitBucket> | undefined): "ok" | "missing" | "check" {
  if (!pantryUnits) {
    return "missing";
  }
  if (need.mixedUnits) {
    return "check";
  }
  const sameUnit = pantryUnits.get(unitKey(need.unit));
  if (!sameUnit) {
    return "check";
  }
  if (need.quantity == null) {
    return "ok";
  }
  if (!sameUnit.hasNumeric || sameUnit.sum < need.quantity) {
    return "missing";
  }
  return "ok";
}

export function matchRecipes(pantry: PantryStock[], recipes: RecipeWithIngredientNames[]): RecipeMatch[] {
  const pantryByName = groupPantryByName(pantry);

  const matches = recipes.map((recipe) => {
    const needs = groupRecipeNeeds(recipe.ingredients);
    const matchedNames: string[] = [];
    const missingNames: string[] = [];
    const checkNames: string[] = [];

    for (const need of needs) {
      const status = classifyNeed(need, pantryByName.get(normalizeName(need.original)));
      if (status === "ok") {
        matchedNames.push(need.original);
      } else if (status === "missing") {
        missingNames.push(need.original);
      } else {
        checkNames.push(need.original);
      }
    }

    const uniqueCount = needs.length;
    const score = uniqueCount === 0 ? 0 : (matchedNames.length + checkNames.length * 0.5) / uniqueCount;

    return {
      recipeId: recipe.id,
      title: recipe.title,
      score,
      matchedNames,
      missingNames,
      checkNames,
    };
  });

  return matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.missingNames.length !== b.missingNames.length) {
      return a.missingNames.length - b.missingNames.length;
    }
    if (a.checkNames.length !== b.checkNames.length) {
      return a.checkNames.length - b.checkNames.length;
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
