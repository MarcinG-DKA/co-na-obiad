import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { saveRecipeSchema } from "@/lib/recipe-schemas";
import { getRecipe, removeRecipe, saveRecipe, RecipeNotFoundError } from "@/lib/services/recipe";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
  }

  const recipeId = context.params.id;
  if (!recipeId) {
    return jsonResponse({ error: "Recipe ID is required" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  try {
    const recipe = await getRecipe(supabase, recipeId, householdId);
    return jsonResponse({ data: recipe });
  } catch (err) {
    if (err instanceof RecipeNotFoundError) {
      return jsonResponse({ error: "Recipe not found" }, 404);
    }
    return jsonResponse({ error: "Could not load recipe" }, 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
  }

  const recipeId = context.params.id;
  if (!recipeId) {
    return jsonResponse({ error: "Recipe ID is required" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const parsed = saveRecipeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, 400);
  }

  try {
    const recipe = await saveRecipe(supabase, householdId, parsed.data, recipeId);
    return jsonResponse({ data: recipe });
  } catch (err) {
    if (err instanceof RecipeNotFoundError) {
      return jsonResponse({ error: "Recipe not found" }, 404);
    }
    return jsonResponse({ error: "Could not save recipe" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
  }

  const recipeId = context.params.id;
  if (!recipeId) {
    return jsonResponse({ error: "Recipe ID is required" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  try {
    await removeRecipe(supabase, recipeId, householdId);
    return jsonResponse({ data: null });
  } catch (err) {
    if (err instanceof RecipeNotFoundError) {
      return jsonResponse({ error: "Recipe not found" }, 404);
    }
    return jsonResponse({ error: "Could not remove recipe" }, 500);
  }
};
