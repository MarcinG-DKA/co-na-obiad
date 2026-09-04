import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import { isProtectedPath } from "@/lib/protected-routes";
import {
  CURRENT_HOUSEHOLD_COOKIE,
  householdCookieOptions,
  listMemberships,
  resolveHouseholdId,
} from "@/lib/services/household";

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
    try {
      const memberships = await listMemberships(supabase, context.locals.user.id);
      const incoming = context.cookies.get(CURRENT_HOUSEHOLD_COOKIE)?.value;
      const resolved = resolveHouseholdId(memberships, incoming);
      context.locals.householdId = resolved;

      if (resolved !== null && resolved !== incoming) {
        context.cookies.set(CURRENT_HOUSEHOLD_COOKIE, resolved, householdCookieOptions(context.url));
      }
    } catch {
      context.locals.householdId = context.cookies.get(CURRENT_HOUSEHOLD_COOKIE)?.value ?? null;
    }
  }

  if (isProtectedPath(context.url.pathname) && !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const response = await next();

  responseHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });

  return response;
});
