import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { listMatches } from "@/lib/services/matching";

jest.mock("@/lib/supabase", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/lib/services/matching", () => {
  const actual = jest.requireActual<typeof import("@/lib/services/matching")>("@/lib/services/matching");
  return {
    ...actual,
    listMatches: jest.fn(),
  };
});

import { GET } from "@/pages/api/matches/index";

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockListMatches = listMatches as jest.MockedFunction<typeof listMatches>;

const sampleMatch = {
  recipeId: "omelette",
  title: "Omelette",
  score: 0.5,
  matchedNames: ["eggs"],
  missingNames: ["salt"],
};

function context(
  overrides: {
    user?: { id: string } | null;
    householdId?: string | null;
  } = {},
): APIContext {
  return {
    locals: {
      user: overrides.user === undefined ? { id: "user-1" } : overrides.user,
      householdId: overrides.householdId === undefined ? "hh-1" : overrides.householdId,
    },
    request: new Request("http://localhost/api/matches", { method: "GET" }),
    cookies: {} as APIContext["cookies"],
  } as APIContext;
}

async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("GET /api/matches", () => {
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

  it("returns 500 when listMatches throws", async () => {
    mockListMatches.mockRejectedValue(new Error("boom"));
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Could not load matches" });
  });

  it("returns ranked matches for the household", async () => {
    mockListMatches.mockResolvedValue([sampleMatch]);
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: [sampleMatch] });
    expect(mockListMatches).toHaveBeenCalledWith(expect.anything(), "hh-1");
  });
});
