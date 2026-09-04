import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { CURRENT_HOUSEHOLD_COOKIE, householdCookieOptions } from "@/lib/services/household";

export const prerender = false;

const joinSchema = z.object({
  code: z.string().trim().min(1),
});

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = joinSchema.safeParse({ code: form.get("code") });
  if (!parsed.success) {
    return context.redirect(`/join?error=${encodeURIComponent("Invite code is required")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/join?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { data: householdId, error } = await supabase.rpc("join_household", { p_code: parsed.data.code });

  if (error) {
    return context.redirect(`/join?error=${encodeURIComponent("Could not join")}`);
  }

  context.cookies.set(CURRENT_HOUSEHOLD_COOKIE, householdId, householdCookieOptions(context.url));
  return context.redirect("/");
};
