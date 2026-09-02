import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { getRecipe, listRecipes, RecipeNotFoundError, removeRecipe, saveRecipe } from "@/lib/services/recipe";

jest.mock("@/lib/supabase", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/services/recipe", () => {
  const actual = jest.requireActual<typeof import("@/lib/services/recipe")>("@/lib/services/recipe");
  return {
    ...actual,
    listRecipes: jest.fn(),
    getRecipe: jest.fn(),
    saveRecipe: jest.fn(),
    removeRecipe: jest.fn(),
  };
});

import { GET, POST } from "@/pages/api/recipes/index";
import { GET as GET_ONE, PATCH, DELETE } from "@/pages/api/recipes/[id]";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockList = listRecipes as jest.MockedFunction<typeof listRecipes>;
const mockGet = getRecipe as jest.MockedFunction<typeof getRecipe>;
const mockSave = saveRecipe as jest.MockedFunction<typeof saveRecipe>;
const mockRemove = removeRecipe as jest.MockedFunction<typeof removeRecipe>;

const sampleListItem = {
  id: "recipe-1",
  household_id: "hh-1",
  title: "Soup",
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  ingredient_count: 1,
};

const sampleRecipe = {
  ...sampleListItem,
  steps: ["boil"],
  ingredients: [
    {
      id: "ing-1",
      name: "water",
      quantity: 1,
      unit: "ml",
      position: 0,
      created_at: "2026-09-02T00:00:00Z",
      updated_at: "2026-09-02T00:00:00Z",
    },
  ],
};

const writeBody = {
  title: "Soup",
  steps: ["boil"],
  ingredients: [{ name: "water", quantity: 1, unit: "ml" }],
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
      ? new Request("http://localhost/api/recipes", { method })
      : new Request("http://localhost/api/recipes", {
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
    params: { id: overrides.id ?? "recipe-1" },
  } as APIContext;
}

async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("GET /api/recipes", () => {
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

  it("returns the household recipes", async () => {
    mockList.mockResolvedValue([sampleListItem]);
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: [sampleListItem] });
  });
});

describe("POST /api/recipes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 400 for invalid JSON", async () => {
    const { status, body } = await read(await POST(context({ method: "POST", body: "not-json" })));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Invalid JSON" });
  });

  it("returns 400 when title is missing", async () => {
    const { status } = await read(await POST(context({ method: "POST", body: { ingredients: [{ name: "water" }] } })));
    expect(status).toBe(400);
  });

  it("returns 400 when ingredients are empty", async () => {
    const { status } = await read(await POST(context({ method: "POST", body: { title: "Soup", ingredients: [] } })));
    expect(status).toBe(400);
  });

  it("returns 400 when unit is not ml, g, or pcs", async () => {
    const { status } = await read(
      await POST(context({ method: "POST", body: { title: "Soup", ingredients: [{ name: "water", unit: "L" }] } })),
    );
    expect(status).toBe(400);
  });

  it("returns 201 with the created recipe", async () => {
    mockSave.mockResolvedValue(sampleRecipe);
    const { status, body } = await read(await POST(context({ method: "POST", body: writeBody })));
    expect(status).toBe(201);
    expect(body).toEqual({ data: sampleRecipe });
    expect(mockSave).toHaveBeenCalledWith(expect.anything(), "hh-1", {
      title: "Soup",
      steps: ["boil"],
      ingredients: [{ name: "water", quantity: 1, unit: "ml" }],
    });
  });
});

describe("GET /api/recipes/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 404 when the recipe is missing", async () => {
    mockGet.mockRejectedValue(new RecipeNotFoundError());
    const { status, body } = await read(await GET_ONE(context({ id: "missing" })));
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Recipe not found" });
  });

  it("returns the recipe", async () => {
    mockGet.mockResolvedValue(sampleRecipe);
    const { status, body } = await read(await GET_ONE(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: sampleRecipe });
  });
});

describe("PATCH /api/recipes/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 404 when the recipe is missing", async () => {
    mockSave.mockRejectedValue(new RecipeNotFoundError());
    const { status, body } = await read(await PATCH(context({ method: "PATCH", body: writeBody, id: "missing" })));
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Recipe not found" });
  });
});

describe("DELETE /api/recipes/:id", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateClient.mockReturnValue({} as ReturnType<typeof createClient>);
  });

  it("returns 404 when the recipe is missing", async () => {
    mockRemove.mockRejectedValue(new RecipeNotFoundError());
    const { status, body } = await read(await DELETE(context({ method: "DELETE", id: "missing" })));
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Recipe not found" });
  });

  it("returns 200 on success", async () => {
    mockRemove.mockResolvedValue(undefined);
    const { status, body } = await read(await DELETE(context({ method: "DELETE" })));
    expect(status).toBe(200);
    expect(body).toEqual({ data: null });
  });
});
