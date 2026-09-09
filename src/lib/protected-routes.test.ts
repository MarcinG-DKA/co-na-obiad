import { isProtectedPath, shouldRedirectUnauthenticated } from "@/lib/protected-routes";

describe("isProtectedPath", () => {
  it("protects exact / without implying /auth/signin", () => {
    expect(isProtectedPath("/")).toBe(true);
    expect(isProtectedPath("/auth/signin")).toBe(false);
  });

  it("does not protect auth or API routes", () => {
    expect(isProtectedPath("/auth/signup")).toBe(false);
    expect(isProtectedPath("/auth/confirm-email")).toBe(false);
    expect(isProtectedPath("/api/auth/signin")).toBe(false);
    expect(isProtectedPath("/api/matches")).toBe(false);
  });

  it("protects prefix app routes including nested recipes", () => {
    expect(isProtectedPath("/join")).toBe(true);
    expect(isProtectedPath("/pantry")).toBe(true);
    expect(isProtectedPath("/recipes")).toBe(true);
    expect(isProtectedPath("/recipes/new")).toBe(true);
    expect(isProtectedPath("/recipes/abc-123")).toBe(true);
  });

  it("does not protect /dashboard (missing page, not a gated alias)", () => {
    expect(isProtectedPath("/dashboard")).toBe(false);
  });
});

describe("shouldRedirectUnauthenticated", () => {
  it("redirects a guest away from /", () => {
    expect(shouldRedirectUnauthenticated("/", null)).toBe(true);
  });

  it("does not redirect a guest on /auth/signin", () => {
    expect(shouldRedirectUnauthenticated("/auth/signin", null)).toBe(false);
  });

  it("does not redirect a signed-in user on /", () => {
    expect(shouldRedirectUnauthenticated("/", { id: "user-1" })).toBe(false);
  });
});
