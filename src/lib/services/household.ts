import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

export const CURRENT_HOUSEHOLD_COOKIE = "current_household_id";

export interface HouseholdMembership {
  household_id: string;
  created_at: string;
}

type AppSupabaseClient = SupabaseClient<Database>;

export function householdCookieOptions(url: URL): {
  path: string;
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
} {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
  };
}

export function resolveHouseholdId(
  memberships: readonly HouseholdMembership[],
  cookieValue: string | undefined,
): string | null {
  if (memberships.length === 0) {
    return null;
  }

  if (cookieValue !== undefined && memberships.some((membership) => membership.household_id === cookieValue)) {
    return cookieValue;
  }

  return [...memberships].reduce((earliest, membership) =>
    membership.created_at < earliest.created_at ? membership : earliest,
  ).household_id;
}

export async function listMemberships(supabase: AppSupabaseClient, userId: string): Promise<HouseholdMembership[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("household_id, created_at")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
