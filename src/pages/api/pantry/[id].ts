import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { updatePantryItemSchema } from "@/lib/pantry-schemas";
import { updatePantryItem, removePantryItem, PantryNotFoundError } from "@/lib/services/pantry";

export const prerender = false;

export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return jsonResponse({ error: "Not authenticated" }, 401);
  }

  const householdId = context.locals.householdId;
  if (!householdId) {
    return jsonResponse({ error: "No household" }, 400);
  }

  const itemId = context.params.id;
  if (!itemId) {
    return jsonResponse({ error: "Item ID is required" }, 400);
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

  const parsed = updatePantryItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, 400);
  }

  try {
    const item = await updatePantryItem(supabase, itemId, householdId, parsed.data);
    return jsonResponse({ data: item });
  } catch (err) {
    if (err instanceof PantryNotFoundError) {
      return jsonResponse({ error: "Item not found" }, 404);
    }
    return jsonResponse({ error: "Could not update item" }, 500);
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

  const itemId = context.params.id;
  if (!itemId) {
    return jsonResponse({ error: "Item ID is required" }, 400);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonResponse({ error: "Supabase is not configured" }, 500);
  }

  try {
    await removePantryItem(supabase, itemId, householdId);
    return jsonResponse({ data: null });
  } catch (err) {
    if (err instanceof PantryNotFoundError) {
      return jsonResponse({ error: "Item not found" }, 404);
    }
    return jsonResponse({ error: "Could not remove item" }, 500);
  }
};
