import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { addPantryItemSchema } from "@/lib/pantry-schemas";
import { listPantryItems, addPantryItem } from "@/lib/services/pantry";

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
    const items = await listPantryItems(supabase, householdId);
    return jsonResponse({ data: items });
  } catch {
    return jsonResponse({ error: "Could not load pantry items" }, 500);
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

  const parsed = addPantryItemSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, 400);
  }

  try {
    const item = await addPantryItem(supabase, householdId, parsed.data);
    return jsonResponse({ data: item }, 201);
  } catch {
    return jsonResponse({ error: "Could not add item" }, 500);
  }
};
