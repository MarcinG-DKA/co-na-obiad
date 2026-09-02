import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

type AppSupabaseClient = SupabaseClient<Database>;

export class PantryNotFoundError extends Error {
  constructor() {
    super("Item not found");
    this.name = "PantryNotFoundError";
  }
}

export interface PantryItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

export async function listPantryItems(supabase: AppSupabaseClient, householdId: string): Promise<PantryItem[]> {
  const { data, error } = await supabase
    .from("pantry_items")
    .select("id, household_id, name, quantity, unit, created_at, updated_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function addPantryItem(
  supabase: AppSupabaseClient,
  householdId: string,
  input: { name: string; quantity?: number | null; unit?: string | null },
): Promise<PantryItem> {
  const { data, error } = await supabase
    .from("pantry_items")
    .insert({
      household_id: householdId,
      name: input.name,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
    })
    .select("id, household_id, name, quantity, unit, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updatePantryItem(
  supabase: AppSupabaseClient,
  itemId: string,
  householdId: string,
  input: { name?: string; quantity?: number | null; unit?: string | null },
): Promise<PantryItem> {
  const { data, error } = await supabase
    .from("pantry_items")
    .update(input)
    .eq("id", itemId)
    .eq("household_id", householdId)
    .select("id, household_id, name, quantity, unit, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new PantryNotFoundError();
    }
    throw new Error(error.message);
  }

  return data;
}

export async function removePantryItem(
  supabase: AppSupabaseClient,
  itemId: string,
  householdId: string,
): Promise<void> {
  const { error, count } = await supabase
    .from("pantry_items")
    .delete({ count: "exact" })
    .eq("id", itemId)
    .eq("household_id", householdId);

  if (error) {
    throw new Error(error.message);
  }

  if (!count) {
    throw new PantryNotFoundError();
  }
}
