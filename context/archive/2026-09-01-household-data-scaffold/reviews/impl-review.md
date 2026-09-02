<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Household data model and RLS policies

- **Plan**: `context/changes/household-data-scaffold/plan.md`
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — SECURITY DEFINER create_household_for_user execute grants

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260901141851_household_data_scaffold.sql:61
- **Detail**: `create_household_for_user(p_user_id)` is SECURITY DEFINER, inserts a household and membership for any UUID, and never checks `auth.uid()`. Line 92 only `REVOKE ALL FROM PUBLIC`. If `anon`/`authenticated` still have EXECUTE (default grants or role-specific grants), a client could provision memberships for arbitrary users. `generate_invite_code()` has no revoke at all (low harm: returns a random hex string).
- **Fix A ⭐ Recommended**: New migration: `REVOKE ALL ON FUNCTION public.create_household_for_user(uuid), public.generate_invite_code(), public.handle_new_user() FROM PUBLIC, anon, authenticated;` leave execute to the table owner / trigger.
  - Strength: Closes a DEFINER write path without changing signup (trigger still runs as owner).
  - Tradeoff: Extra migration after F-01 is already applied on the linked project.
  - Confidence: MEDIUM — have not dumped live `has_function_privilege` for anon/authenticated on this function.
  - Blind spot: Actual grants on hosted Supabase after the first migration.
- **Fix B**: Verify grants in SQL (`select proname, grantee, privilege_type from ...`) and only revoke if EXECUTE is present.
  - Strength: Avoids an unnecessary migration if PUBLIC revoke already dropped the grant.
  - Tradeoff: Leaves a landmine if a future restore/reset re-applies default PUBLIC execute.
  - Confidence: MEDIUM — depends on live catalog.
  - Blind spot: Local Docker was never running; only linked remote is source of truth.
- **Decision**: FIXED via Fix A

### F2 — Membership/invite query errors look like “no household”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/household.ts:50
- **Detail**: `listMemberships` returns `[]` on any PostgREST error. Middleware then sets `householdId = null` and skips cookie repair. Dashboard (`src/pages/dashboard.astro:10`) discards `error` on the invite_code SELECT, so a failed load with a valid `householdId` also renders “No household”. Transient DB failure is indistinguishable from having no membership.
- **Fix**: If `error`, do not treat as empty memberships (leave prior cookie / fail the request); on dashboard, distinguish query error from missing row.
- **Decision**: FIXED

### F3 — Invite-code existence oracle (planned)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260901141851_household_data_scaffold.sql:148
- **Detail**: `join_household` raises `Unknown invite code`; the join API forwards `error.message` to `/join?error=`. That is an existence oracle, but the plan required raise-on-unknown and the signup-style error query. Codes are 32-char hex (128-bit); brute force is impractical. Non-member SELECT-by-code was correctly avoided.
- **Fix**: Leave as designed; optionally map unknown-code to a generic “Could not join” string so the UI does not echo Postgres.
- **Decision**: FIXED

### F4 — Supporting extras outside Changes Required

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: N/A
- **Detail**: Diff also includes `supabase/seed.sql` (empty, called out in Migration Notes), `db:types` + zod in package.json (implied by the plan), eslint ignore for generated types, `.gitignore` for `supabase/.temp/`, and context/roadmap stamps. No pantry, switcher, owner UI, or auth-route retrofit.
- **Fix**: No code change; treat as supporting, not scope creep.
- **Decision**: ACCEPTED — supporting extras, not scope creep
