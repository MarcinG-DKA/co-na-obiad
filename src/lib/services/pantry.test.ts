import {
  addPantryItem,
  listPantryItems,
  PantryNotFoundError,
  removePantryItem,
  updatePantryItem,
} from "@/lib/services/pantry";
import type { Database } from "@/db/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

function createQueryBuilder(result: QueryResult) {
  const eq = jest.fn();
  const order = jest.fn();
  const select = jest.fn();
  const insert = jest.fn();
  const update = jest.fn();
  const del = jest.fn();
  const single = jest.fn();

  const builder: {
    select: (...args: unknown[]) => unknown;
    insert: (...args: unknown[]) => unknown;
    update: (...args: unknown[]) => unknown;
    delete: (...args: unknown[]) => unknown;
    eq: (...args: unknown[]) => unknown;
    order: (...args: unknown[]) => unknown;
    single: () => Promise<QueryResult>;
    then: (onFulfilled: (value: QueryResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
  } = {
    select: (...args: unknown[]) => {
      select(...args);
      return builder;
    },
    insert: (...args: unknown[]) => {
      insert(...args);
      return builder;
    },
    update: (...args: unknown[]) => {
      update(...args);
      return builder;
    },
    delete: (...args: unknown[]) => {
      del(...args);
      return builder;
    },
    eq: (...args: unknown[]) => {
      eq(...args);
      return builder;
    },
    order: (...args: unknown[]) => {
      order(...args);
      return builder;
    },
    single: () => {
      single();
      return Promise.resolve(result);
    },
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return { builder, eq, order, select, insert, update, delete: del, single };
}

function createClient(result: QueryResult) {
  const query = createQueryBuilder(result);
  const from = jest.fn(() => query.builder);
  return { client: { from } as unknown as SupabaseClient<Database>, from, query };
}

const sampleItem = {
  id: "item-1",
  household_id: "hh-1",
  name: "Milk",
  quantity: 2,
  unit: "L",
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

describe("listPantryItems", () => {
  it("returns rows ordered by created_at", async () => {
    const { client, from, query } = createClient({ data: [sampleItem], error: null });
    await expect(listPantryItems(client, "hh-1")).resolves.toEqual([sampleItem]);
    expect(from).toHaveBeenCalledWith("pantry_items");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("throws on a PostgREST error instead of returning []", async () => {
    const { client } = createClient({ data: null, error: { message: "boom" } });
    await expect(listPantryItems(client, "hh-1")).rejects.toThrow("boom");
  });
});

describe("addPantryItem", () => {
  it("inserts with household_id and nulls omitted optionals", async () => {
    const { client, query } = createClient({ data: sampleItem, error: null });
    await expect(addPantryItem(client, "hh-1", { name: "Milk" })).resolves.toEqual(sampleItem);
    expect(query.insert).toHaveBeenCalledWith({
      household_id: "hh-1",
      name: "Milk",
      quantity: null,
      unit: null,
    });
  });

  it("throws on insert error", async () => {
    const { client } = createClient({ data: null, error: { message: "insert failed" } });
    await expect(addPantryItem(client, "hh-1", { name: "Milk" })).rejects.toThrow("insert failed");
  });
});

describe("updatePantryItem", () => {
  it("scopes the update to id and household_id", async () => {
    const { client, query } = createClient({ data: sampleItem, error: null });
    await updatePantryItem(client, "item-1", "hh-1", { name: "Whole Milk" });
    expect(query.update).toHaveBeenCalledWith({ name: "Whole Milk" });
    expect(query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
  });

  it("throws PantryNotFoundError when .single() finds no row", async () => {
    const { client } = createClient({ data: null, error: { message: "not found", code: "PGRST116" } });
    await expect(updatePantryItem(client, "missing", "hh-1", { name: "X" })).rejects.toBeInstanceOf(
      PantryNotFoundError,
    );
  });
});

describe("removePantryItem", () => {
  it("throws PantryNotFoundError when count is 0", async () => {
    const { client, query } = createClient({ data: null, error: null, count: 0 });
    await expect(removePantryItem(client, "item-1", "hh-1")).rejects.toBeInstanceOf(PantryNotFoundError);
    expect(query.delete).toHaveBeenCalledWith({ count: "exact" });
    expect(query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(query.eq).toHaveBeenCalledWith("household_id", "hh-1");
  });

  it("resolves when a row is deleted", async () => {
    const { client } = createClient({ data: null, error: null, count: 1 });
    await expect(removePantryItem(client, "item-1", "hh-1")).resolves.toBeUndefined();
  });
});
