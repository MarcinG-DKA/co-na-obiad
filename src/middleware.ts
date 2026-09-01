import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import {
  CURRENT_HOUSEHOLD_COOKIE,
  householdCookieOptions,
  listMemberships,
  resolveHouseholdId,
} from "@/lib/services/household";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const responseHeaders = new Headers();
  const supabase = createClient(context.request.headers, context.cookies, responseHeaders);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  context.locals.householdId = null;

  if (supabase && context.locals.user) {
    const memberships = await listMemberships(supabase, context.locals.user.id);
    const incoming = context.cookies.get(CURRENT_HOUSEHOLD_COOKIE)?.value;
    const resolved = resolveHouseholdId(memberships, incoming);
    context.locals.householdId = resolved;

    if (resolved !== null && resolved !== incoming) {
      context.cookies.set(CURRENT_HOUSEHOLD_COOKIE, resolved, householdCookieOptions(context.url));
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  const response = await next();

  responseHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
});
