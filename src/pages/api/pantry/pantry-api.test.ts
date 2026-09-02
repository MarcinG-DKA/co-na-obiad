import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import {
  addPantryItem,
  listPantryItems,
  PantryNotFoundError,
  removePantryItem,
  updatePantryItem,
} from "@/lib/services/pantry";

jest.mock("@/lib/supabase", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/services/pantry", () => {
  const actual = jest.requireActual<typeof import("@/lib/services/pantry")>("@/lib/services/pantry");
  return {
    ...actual,
    listPantryItems: jest.fn(),
    addPantryItem: jest.fn(),
    updatePantryItem: jest.fn(),
    removePantryItem: jest.fn(),
  };
});

import { GET, POST } from "@/pages/api/pantry/index";
import { PATCH, DELETE } from "@/pages/api/pantry/[id]";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockList = listPantryItems as jest.MockedFunction<typeof listPantryItems>;
const mockAdd = addPantryItem as jest.MockedFunction<typeof addPantryItem>;
const mockUpdate = updatePantryItem as jest.MockedFunction<typeof updatePantryItem>;
const mockRemove = removePantryItem as jest.MockedFunction<typeof removePantryItem>;

const sampleItem = {
  id: "item-1",
  household_id: "hh-1",
  name: "Milk",
  quantity: null,
  unit: null,
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

function context(
  overrides: {
    user?: { id: string } | null;
    householdId?: string | null;
    method?: string;
    body?: unknown;
    id?: string;
  } = {},
): APIContext {
  const method = overrides.method ?? "GET";
  const body = overrides.body;
  const request =
    body === undefined
      ? new Request("http://localhost/api/pantry", { method })
      : new Request("http://localhost/api/pantry", {
          method,
          headers: { "Content-Type": "application/json" },
          body: typeof body === "string" ? body : JSON.stringify(body),
        });

  return {
    locals: {
      user: overrides.user === undefined ? { id: "user-1" } : overrides.user,
      householdId: overrides.householdId === undefined ? "hh-1" : overrides.householdId,
    },
    request,
    cookies: {} as APIContext["cookies"],
    params: { id: overrides.id ?? "item-1" },
  } as APIContext;
}

async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("GET /api/pantry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 401 when unauthenticated", async () => {
    const { status, body } = await read(await GET(context({ user: null })));
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Not authenticated" });
  });

  it("returns 400 when there is no household", async () => {
    const { status, body } = await read(await GET(context({ householdId: null })));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "No household" });
  });

  it("returns 500 when Supabase is not configured", async () => {
    mockCreateClient.mockReturnValue(null);
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Supabase is not configured" });
  });

  it("returns the household pantry", async () => {
    mockList.mockResolvedValue([sampleItem]);
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: [sampleItem] });
  });
});

describe("POST /api/pantry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 400 for invalid JSON", async () => {
    const { status, body } = await read(await POST(context({ method: "POST", body: "not-json" })));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when name is missing", async () => {
    const { status } = await read(await POST(context({ method: "POST", body: {} })));
    expect(status).toBe(400);
  });

  it("returns 201 with the created item", async () => {
    mockAdd.mockResolvedValue(sampleItem);
    const { status, body } = await read(await POST(context({ method: "POST", body: { name: "Milk" } })));
    expect(status).toBe(201);
    expect(body).toEqual({ data: sampleItem });
    expect(mockAdd).toHaveBeenCalledWith(expect.anything(), "hh-1", { name: "Milk" });
  });
});

describe("PATCH /api/pantry/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 404 when the item is missing", async () => {
    mockUpdate.mockRejectedValue(new PantryNotFoundError());
    const { status, body } = await read(
      await PATCH(context({ method: "PATCH", body: { name: "Whole Milk" }, id: "missing" })),
    );
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Item not found" });
  });
});

describe("DELETE /api/pantry/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 404 when the item is missing", async () => {
    mockRemove.mockRejectedValue(new PantryNotFoundError());
    const { status, body } = await read(await DELETE(context({ method: "DELETE", id: "missing" })));
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Item not found" });
  });

  it("returns 200 on success", async () => {
    mockRemove.mockResolvedValue(undefined);
    const { status, body } = await read(await DELETE(context({ method: "DELETE" })));
    expect(status).toBe(200);
    expect(body).toEqual({ data: null });
  });
});
