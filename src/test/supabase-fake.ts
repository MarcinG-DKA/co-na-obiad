import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_TS = "2026-01-01T00:00:00.000Z";

export interface FakePantryItemSeed {
  id: string;
  household_id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface FakeRecipeIngredientSeed {
  id?: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  position?: number;
  created_at?: string;
  updated_at?: string;
}

export interface FakeRecipeSeed {
  id: string;
  household_id: string;
  title: string;
  steps?: string[];
  created_at?: string;
  updated_at?: string;
  ingredients?: FakeRecipeIngredientSeed[];
}

export interface FakeSupabaseSeed {
  pantryItems?: FakePantryItemSeed[];
  recipes?: FakeRecipeSeed[];
}

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

interface Filter {
  column: string;
  value: unknown;
}

interface OrderSpec {
  column: string;
  ascending: boolean;
  referencedTable?: string;
}

interface PantryRow {
  id: string;
  household_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  created_at: string;
  updated_at: string;
}

interface IngredientRow {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

interface RecipeRow {
  id: string;
  household_id: string;
  title: string;
  steps: string[];
  created_at: string;
  updated_at: string;
  ingredients: IngredientRow[];
}

interface Store {
  pantryItems: PantryRow[];
  recipes: RecipeRow[];
}

const NO_ROWS: QueryResult = {
  data: null,
  error: {
    code: "PGRST116",
    message: "JSON object requested, multiple (or no) rows returned",
  },
};

function isoNow(): string {
  return new Date().toISOString();
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function pantryMatches(row: PantryRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.column === "id") {
      return row.id === filter.value;
    }
    if (filter.column === "household_id") {
      return row.household_id === filter.value;
    }
    return false;
  });
}

function recipeMatches(row: RecipeRow, filters: Filter[]): boolean {
  return filters.every((filter) => {
    if (filter.column === "id") {
      return row.id === filter.value;
    }
    if (filter.column === "household_id") {
      return row.household_id === filter.value;
    }
    return false;
  });
}

function compareValues(left: unknown, right: unknown, ascending: boolean): number {
  if (left === right) {
    return 0;
  }
  if (typeof left === "string" && typeof right === "string") {
    const cmp = left < right ? -1 : 1;
    return ascending ? cmp : -cmp;
  }
  if (typeof left === "number" && typeof right === "number") {
    const cmp = left < right ? -1 : 1;
    return ascending ? cmp : -cmp;
  }
  return 0;
}

function sortPantry(rows: PantryRow[], orders: OrderSpec[]): PantryRow[] {
  const parentOrders = orders.filter((order) => order.referencedTable === undefined);
  return [...rows].sort((a, b) => {
    for (const order of parentOrders) {
      const cmp = compareValues(
        a[order.column as keyof PantryRow],
        b[order.column as keyof PantryRow],
        order.ascending,
      );
      if (cmp !== 0) {
        return cmp;
      }
    }
    return 0;
  });
}

function sortRecipes(rows: RecipeRow[], orders: OrderSpec[]): RecipeRow[] {
  const parentOrders = orders.filter((order) => order.referencedTable === undefined);
  return [...rows].sort((a, b) => {
    for (const order of parentOrders) {
      const cmp = compareValues(
        a[order.column as keyof RecipeRow],
        b[order.column as keyof RecipeRow],
        order.ascending,
      );
      if (cmp !== 0) {
        return cmp;
      }
    }
    return 0;
  });
}

function projectRecipe(row: RecipeRow, select: string): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    id: row.id,
    household_id: row.household_id,
    title: row.title,
    steps: row.steps,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (select.includes("recipe_ingredients(count)")) {
    projected.recipe_ingredients = [{ count: row.ingredients.length }];
    return projected;
  }
  if (select.includes("recipe_ingredients")) {
    projected.recipe_ingredients = [...row.ingredients].sort((a, b) => a.position - b.position);
  }
  return projected;
}

function normalizePantry(seed: FakePantryItemSeed): PantryRow {
  return {
    id: seed.id,
    household_id: seed.household_id,
    name: seed.name,
    quantity: seed.quantity ?? null,
    unit: seed.unit ?? null,
    created_at: seed.created_at ?? DEFAULT_TS,
    updated_at: seed.updated_at ?? DEFAULT_TS,
  };
}

function normalizeIngredient(seed: FakeRecipeIngredientSeed, index: number): IngredientRow {
  return {
    id: seed.id ?? crypto.randomUUID(),
    name: seed.name,
    quantity: seed.quantity ?? null,
    unit: seed.unit ?? null,
    position: seed.position ?? index,
    created_at: seed.created_at ?? DEFAULT_TS,
    updated_at: seed.updated_at ?? DEFAULT_TS,
  };
}

function normalizeRecipe(seed: FakeRecipeSeed): RecipeRow {
  return {
    id: seed.id,
    household_id: seed.household_id,
    title: seed.title,
    steps: seed.steps ?? [],
    created_at: seed.created_at ?? DEFAULT_TS,
    updated_at: seed.updated_at ?? DEFAULT_TS,
    ingredients: (seed.ingredients ?? []).map((ingredient, index) => normalizeIngredient(ingredient, index)),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseIngredients(value: unknown): IngredientRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: unknown[] = value;
  const rows: IngredientRow[] = [];
  for (const [index, item] of items.entries()) {
    const record = asRecord(item);
    if (record === null || typeof record.name !== "string") {
      continue;
    }
    rows.push({
      id: crypto.randomUUID(),
      name: record.name,
      quantity: asNullableNumber(record.quantity),
      unit: asNullableString(record.unit),
      position: index,
      created_at: isoNow(),
      updated_at: isoNow(),
    });
  }
  return rows;
}

function applyPantryPatch(row: PantryRow, patch: Record<string, unknown>): void {
  if ("name" in patch && typeof patch.name === "string") {
    row.name = patch.name;
  }
  if ("quantity" in patch) {
    row.quantity = asNullableNumber(patch.quantity);
  }
  if ("unit" in patch) {
    row.unit = asNullableString(patch.unit);
  }
  row.updated_at = isoNow();
}

function toSingle(rows: unknown[]): QueryResult {
  if (rows.length !== 1) {
    return NO_ROWS;
  }
  return { data: rows[0], error: null };
}

function toMaybeSingle(rows: unknown[]): QueryResult {
  if (rows.length === 0) {
    return { data: null, error: null };
  }
  if (rows.length === 1) {
    return { data: rows[0], error: null };
  }
  return NO_ROWS;
}

function applyLimit<T>(rows: T[], limitCount: number | undefined): T[] {
  if (limitCount === undefined) {
    return rows;
  }
  return rows.slice(0, limitCount);
}

function runSaveRecipe(store: Store, fn: string, args: Record<string, unknown>): QueryResult {
  if (fn !== "save_recipe") {
    return { data: null, error: { message: `Unknown rpc: ${fn}` } };
  }

  const householdId = asString(args.p_household_id);
  const title = asString(args.p_title);
  const steps =
    Array.isArray(args.p_steps) && args.p_steps.every((step) => typeof step === "string") ? args.p_steps : [];
  const ingredients = parseIngredients(args.p_ingredients);
  const recipeId = typeof args.p_recipe_id === "string" ? args.p_recipe_id : null;
  const timestamp = isoNow();

  if (recipeId === null) {
    const created: RecipeRow = {
      id: crypto.randomUUID(),
      household_id: householdId,
      title,
      steps,
      created_at: timestamp,
      updated_at: timestamp,
      ingredients,
    };
    store.recipes.push(created);
    return { data: created.id, error: null };
  }

  const existing = store.recipes.find((recipe) => recipe.id === recipeId && recipe.household_id === householdId);
  if (!existing) {
    return { data: null, error: { message: "Recipe not found" } };
  }

  existing.title = title;
  existing.steps = steps;
  existing.ingredients = ingredients;
  existing.updated_at = timestamp;
  return { data: existing.id, error: null };
}

function createQuery(store: Store, table: string) {
  const filters: Filter[] = [];
  const orders: OrderSpec[] = [];
  let select = "*";
  let insertRow: Record<string, unknown> | null = null;
  let updatePatch: Record<string, unknown> | null = null;
  let deleting = false;
  let limitCount: number | undefined;

  function limitedPantrySelect(): PantryRow[] {
    return applyLimit(
      sortPantry(
        store.pantryItems.filter((row) => pantryMatches(row, filters)),
        orders,
      ).map((row) => ({
        ...row,
      })),
      limitCount,
    );
  }

  function limitedRecipeSelect(): Record<string, unknown>[] {
    return applyLimit(
      sortRecipes(
        store.recipes.filter((row) => recipeMatches(row, filters)),
        orders,
      ).map((row) => projectRecipe(row, select)),
      limitCount,
    );
  }

  function executePantry(wantSingle: boolean): QueryResult {
    if (deleting) {
      const remaining: PantryRow[] = [];
      let count = 0;
      for (const row of store.pantryItems) {
        if (pantryMatches(row, filters)) {
          count += 1;
        } else {
          remaining.push(row);
        }
      }
      store.pantryItems = remaining;
      return { data: null, error: null, count };
    }

    if (insertRow) {
      const created: PantryRow = {
        id: asString(insertRow.id, crypto.randomUUID()),
        household_id: asString(insertRow.household_id),
        name: asString(insertRow.name),
        quantity: asNullableNumber(insertRow.quantity),
        unit: asNullableString(insertRow.unit),
        created_at: asString(insertRow.created_at, isoNow()),
        updated_at: asString(insertRow.updated_at, isoNow()),
      };
      store.pantryItems.push(created);
      const copied = { ...created };
      return wantSingle ? { data: copied, error: null } : { data: [copied], error: null };
    }

    if (updatePatch) {
      const updated: PantryRow[] = [];
      for (const row of store.pantryItems) {
        if (pantryMatches(row, filters)) {
          applyPantryPatch(row, updatePatch);
          updated.push({ ...row });
        }
      }
      return wantSingle ? toSingle(updated) : { data: updated, error: null };
    }

    const rows = limitedPantrySelect();
    return wantSingle ? toSingle(rows) : { data: rows, error: null };
  }

  function executeRecipes(wantSingle: boolean): QueryResult {
    if (deleting) {
      const remaining: RecipeRow[] = [];
      let count = 0;
      for (const row of store.recipes) {
        if (recipeMatches(row, filters)) {
          count += 1;
        } else {
          remaining.push(row);
        }
      }
      store.recipes = remaining;
      return { data: null, error: null, count };
    }

    const rows = limitedRecipeSelect();
    return wantSingle ? toSingle(rows) : { data: rows, error: null };
  }

  function execute(wantSingle: boolean): QueryResult {
    if (table === "pantry_items") {
      return executePantry(wantSingle);
    }
    if (table === "recipes") {
      return executeRecipes(wantSingle);
    }
    return { data: wantSingle ? null : [], error: { message: `Unknown table: ${table}` } };
  }

  function executeMaybeSingle(): QueryResult {
    if (deleting || insertRow || updatePatch) {
      const result = execute(false);
      if (result.error) {
        return result;
      }
      const rows = Array.isArray(result.data) ? result.data : [];
      return toMaybeSingle(rows);
    }
    if (table === "pantry_items") {
      return toMaybeSingle(limitedPantrySelect());
    }
    if (table === "recipes") {
      return toMaybeSingle(limitedRecipeSelect());
    }
    return { data: null, error: { message: `Unknown table: ${table}` } };
  }

  const builder = {
    select(columns?: string) {
      if (columns !== undefined) {
        select = columns;
      }
      return builder;
    },
    insert(row: Record<string, unknown>) {
      insertRow = row;
      return builder;
    },
    update(patch: Record<string, unknown>) {
      updatePatch = patch;
      return builder;
    },
    delete(_options?: { count?: "exact" | "planned" | "estimated" }) {
      deleting = true;
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value });
      return builder;
    },
    order(column: string, options?: { ascending?: boolean; referencedTable?: string }) {
      orders.push({
        column,
        ascending: options?.ascending ?? true,
        referencedTable: options?.referencedTable,
      });
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    single() {
      return Promise.resolve(execute(true));
    },
    maybeSingle() {
      return Promise.resolve(executeMaybeSingle());
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(execute(false)).then(onfulfilled, onrejected);
    },
  };

  return builder;
}

export function createSupabaseFake(seed: FakeSupabaseSeed = {}): SupabaseClient<Database> {
  const store: Store = {
    pantryItems: (seed.pantryItems ?? []).map(normalizePantry),
    recipes: (seed.recipes ?? []).map(normalizeRecipe),
  };

  return {
    from(table: string) {
      return createQuery(store, table);
    },
    rpc(fn: string, args: Record<string, unknown>) {
      return Promise.resolve(runSaveRecipe(store, fn, args));
    },
  } as unknown as SupabaseClient<Database>;
}
