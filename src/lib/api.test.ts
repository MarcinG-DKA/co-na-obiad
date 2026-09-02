import { jsonResponse } from "@/lib/api";

describe("jsonResponse", () => {
  it("returns JSON with status 200 by default", async () => {
    const res = jsonResponse({ data: [1] });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    await expect(res.json()).resolves.toEqual({ data: [1] });
  });

  it("honours an explicit status code", async () => {
    const res = jsonResponse({ error: "No household" }, 400);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "No household" });
  });
});
