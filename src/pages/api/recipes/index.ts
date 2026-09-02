import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { saveRecipeSchema } from "@/lib/recipe-schemas";
import { listRecipes, saveRecipe } from "@/lib/services/recipe";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  try {
    const recipes = await listRecipes(supabase, householdId);
    return jsonResponse({ data: recipes });
  } catch {
    return jsonResponse({ error: "Could not load recipes" }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
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
    const recipe = await saveRecipe(supabase, householdId, parsed.data);
    return jsonResponse({ data: recipe }, 201);
  } catch {
    return jsonResponse({ error: "Could not save recipe" }, 500);
  }
};
