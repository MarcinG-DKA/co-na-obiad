import { resolveHouseholdId, type HouseholdMembership } from "@/lib/services/household";

describe("resolveHouseholdId", () => {
  it("returns null when there are no memberships", () => {
    expect(resolveHouseholdId([], "hh-B")).toBeNull();
  });

  it("rejects a spoofed cookie for B when the user is only a member of A", () => {
    const memberships: HouseholdMembership[] = [{ household_id: "hh-A", created_at: "2026-01-01T00:00:00.000Z" }];

    expect(resolveHouseholdId(memberships, "hh-B")).toBe("hh-A");
  });

  it("uses cookie B after join when membership includes B", () => {
    const memberships: HouseholdMembership[] = [
      { household_id: "hh-A", created_at: "2026-01-01T00:00:00.000Z" },
      { household_id: "hh-B", created_at: "2026-06-01T00:00:00.000Z" },
    ];

    expect(resolveHouseholdId(memberships, "hh-B")).toBe("hh-B");
  });

  it("picks the earliest created_at membership when the cookie is missing", () => {
    const memberships: HouseholdMembership[] = [
      { household_id: "hh-later", created_at: "2026-06-01T00:00:00.000Z" },
      { household_id: "hh-earlier", created_at: "2026-01-01T00:00:00.000Z" },
    ];

    expect(resolveHouseholdId(memberships, undefined)).toBe("hh-earlier");
  });
});
