import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/db/database.types";

type AppSupabaseClient = SupabaseClient<Database>;

const RECIPE_LIST_SELECT = "id, household_id, title, created_at, updated_at, recipe_ingredients(count)";
const RECIPE_DETAIL_SELECT =
  "id, household_id, title, steps, created_at, updated_at, recipe_ingredients(id, name, quantity, unit, position, created_at, updated_at)";
const RECIPE_MATCH_SELECT = "id, title, recipe_ingredients(name, quantity, unit, position)";

export class RecipeNotFoundError extends Error {
  constructor() {
    super("Recipe not found");
    this.name = "RecipeNotFoundError";
  }
}

export interface RecipeIngredient {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeListItem {
  id: string;
  household_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  ingredient_count: number;
}

export interface Recipe {
  id: string;
  household_id: string;
  title: string;
  steps: string[];
  created_at: string;
  updated_at: string;
  ingredients: RecipeIngredient[];
}

export interface RecipeWithIngredientNames {
  id: string;
  title: string;
  ingredients: { name: string; quantity?: number | null; unit?: string | null }[];
}

export interface SaveRecipeInput {
  title: string;
  steps: string[];
  ingredients: {
    name: string;
    quantity?: number | null;
    unit?: string | null;
  }[];
}

interface RecipeListRow {
  id: string;
  household_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  recipe_ingredients: { count: number }[] | null;
}

interface RecipeDetailRow {
  id: string;
  household_id: string;
  title: string;
  steps: string[] | null;
  created_at: string;
  updated_at: string;
  recipe_ingredients: RecipeIngredient[] | null;
}

interface RecipeMatchRow {
  id: string;
  title: string;
  recipe_ingredients: { name: string; quantity: number | null; unit: string | null; position: number }[] | null;
}

function mapListItem(row: RecipeListRow): RecipeListItem {
  return {
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ingredient_count: row.recipe_ingredients?.[0]?.count ?? 0,
  };
}

function mapRecipe(row: RecipeDetailRow): Recipe {
  const ingredients = [...(row.recipe_ingredients ?? [])].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    steps: row.steps ?? [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    ingredients,
  };
}

function mapRecipeWithIngredientNames(row: RecipeMatchRow): RecipeWithIngredientNames {
  const ingredients = [...(row.recipe_ingredients ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? null,
      unit: ingredient.unit ?? null,
    }));
  return {
    id: row.id,
    title: row.title,
    ingredients,
  };
}

function isRecipeNotFoundMessage(message: string): boolean {
  return message.includes("Recipe not found");
}

export async function listRecipes(supabase: AppSupabaseClient, householdId: string): Promise<RecipeListItem[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_LIST_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as RecipeListRow[]).map(mapListItem);
}

export async function listRecipesWithIngredients(
  supabase: AppSupabaseClient,
  householdId: string,
): Promise<RecipeWithIngredientNames[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_MATCH_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true })
    .order("position", { referencedTable: "recipe_ingredients", ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as unknown as RecipeMatchRow[]).map(mapRecipeWithIngredientNames);
}

export async function getRecipe(supabase: AppSupabaseClient, recipeId: string, householdId: string): Promise<Recipe> {
  const { data, error } = await supabase
    .from("recipes")
    .select(RECIPE_DETAIL_SELECT)
    .eq("id", recipeId)
    .eq("household_id", householdId)
    .order("position", { referencedTable: "recipe_ingredients", ascending: true })
    .single();

  if (error) {
    if (error.code === "PGRST116" || isRecipeNotFoundMessage(error.message)) {
      throw new RecipeNotFoundError();
    }
    throw new Error(error.message);
  }

  return mapRecipe(data);
}

export async function saveRecipe(
  supabase: AppSupabaseClient,
  householdId: string,
  input: SaveRecipeInput,
  recipeId?: string,
): Promise<Recipe> {
  const ingredients: Json = input.ingredients.map((ingredient) => ({
    name: ingredient.name,
    quantity: ingredient.quantity ?? null,
    unit: ingredient.unit ?? null,
  }));

  const { data, error } = await supabase.rpc("save_recipe", {
    p_household_id: householdId,
    p_recipe_id: recipeId ?? (null as unknown as string),
    p_title: input.title,
    p_steps: input.steps,
    p_ingredients: ingredients,
  });

  if (error) {
    if (isRecipeNotFoundMessage(error.message)) {
      throw new RecipeNotFoundError();
    }
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Could not save recipe");
  }

  return getRecipe(supabase, data, householdId);
}

export async function removeRecipe(supabase: AppSupabaseClient, recipeId: string, householdId: string): Promise<void> {
  const { error, count } = await supabase
    .from("recipes")
    .delete({ count: "exact" })
    .eq("id", recipeId)
    .eq("household_id", householdId);

  if (error) {
    throw new Error(error.message);
  }

  if (!count) {
    throw new RecipeNotFoundError();
  }
}
