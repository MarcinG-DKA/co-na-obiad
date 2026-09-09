import type { APIContext } from "astro";
import { createClient } from "@/lib/supabase";
import { listPantryItems } from "@/lib/services/pantry";
import { createSupabaseFake } from "@/test/supabase-fake";
import type { MockedFunction } from "vitest";

vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(),
}));

import { PATCH } from "@/pages/api/pantry/[id]";

const mockCreateClient = createClient as MockedFunction<typeof createClient>;

function patchContext(): APIContext {
  return {
    locals: {
      user: { id: "user-1" },
      householdId: "hh-A",
    },
    request: new Request("http://localhost/api/pantry/b-item", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Stolen" }),
    }),
    cookies: {} as APIContext["cookies"],
    params: { id: "b-item" },
  } as unknown as APIContext;
}

describe("PATCH /api/pantry/:id foreign household id", () => {
  it("returns 404 Item not found and leaves household B's row", async () => {
    const client = createSupabaseFake({
      pantryItems: [{ id: "b-item", household_id: "hh-B", name: "B-only pickles" }],
    });
    mockCreateClient.mockReturnValue(client);

    const res = await PATCH(patchContext());
    const body = (await res.json()) as unknown;

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Item not found" });

    const remaining = await listPantryItems(client, "hh-B");
    expect(remaining).toEqual([expect.objectContaining({ id: "b-item", name: "B-only pickles" })]);
  });
});
