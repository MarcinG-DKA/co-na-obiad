import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { jsonResponse } from "@/lib/api";
import { listMatches } from "@/lib/services/matching";

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
    const matches = await listMatches(supabase, householdId);
    return jsonResponse({ data: matches });
  } catch {
    return jsonResponse({ error: "Could not load matches" }, 500);
  }
};
