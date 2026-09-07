import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { getPantryLastUpdatedAt } from "@/lib/services/pantry";

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
    const lastUpdatedAt = await getPantryLastUpdatedAt(supabase, householdId);
    return jsonResponse({ data: { lastUpdatedAt } });
  } catch {
    return jsonResponse({ error: "Could not load pantry status" }, 500);
  }
};
