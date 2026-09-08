import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { getPantryLastUpdatedAt } from "@/lib/services/pantry";
import type { MockedFunction } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/services/pantry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/pantry")>();
  return {
    ...actual,
    getPantryLastUpdatedAt: vi.fn(),
  };
});

import { GET } from "@/pages/api/pantry/freshness";

const mockCreateClient = createClient as MockedFunction<typeof createClient>;
const mockGetLastUpdated = getPantryLastUpdatedAt as MockedFunction<typeof getPantryLastUpdatedAt>;

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
    request: new Request("http://localhost/api/pantry/freshness", { method: "GET" }),
    cookies: {} as APIContext["cookies"],
  } as APIContext;
}

async function read(res: Response): Promise<{ status: number; body: unknown }> {
  return { status: res.status, body: (await res.json()) as unknown };
}

describe("GET /api/pantry/freshness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockReturnValue({});
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

  it("returns 500 when getPantryLastUpdatedAt throws", async () => {
    mockGetLastUpdated.mockRejectedValue(new Error("boom"));
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(500);
    expect(body).toEqual({ error: "Could not load pantry status" });
  });

  it("returns null lastUpdatedAt for an empty pantry", async () => {
    mockGetLastUpdated.mockResolvedValue(null);
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: { lastUpdatedAt: null } });
    expect(mockGetLastUpdated).toHaveBeenCalledWith(expect.anything(), "hh-1");
  });

  it("returns the oldest updated_at timestamp", async () => {
    mockGetLastUpdated.mockResolvedValue("2026-09-02T00:00:00Z");
    const { status, body } = await read(await GET(context()));
    expect(status).toBe(200);
    expect(body).toEqual({ data: { lastUpdatedAt: "2026-09-02T00:00:00Z" } });
  });
});
