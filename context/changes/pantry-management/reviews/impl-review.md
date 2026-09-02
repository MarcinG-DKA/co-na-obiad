<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pantry Management

- **Plan**: `context/changes/pantry-management/plan.md`
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-02
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Quantity 0 allowed in UI, rejected by API

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/pantry/index.ts:10`, `src/pages/api/pantry/[id].ts:11`, `src/components/pantry/PantryManager.tsx:161`
- **Detail**: Zod uses `.positive()` (`> 0`). Add/edit inputs use `min="0"`. Submitting `0` optimistic-adds then 400 + revert + toast. Plan testing listed “zero quantity” as an edge case; Phase 2 contract specified `.positive()`.
- **Fix A ⭐ Recommended**: Change Zod to `z.number().nonnegative()` on add and update so 0 is a valid stored quantity.
  - Strength: Matches the UI `min="0"` and the plan’s listed edge case.
  - Tradeoff: “0 eggs” is an odd pantry state; users may mean “out of stock.”
  - Confidence: HIGH — one-line schema change, UI already accepts 0.
  - Blind spot: No CHECK constraint on the column; still relies on Zod.
- **Fix B**: Change inputs to `min="1"` and keep `.positive()`.
  - Strength: Matches the written Phase 2 contract exactly.
  - Tradeoff: Users cannot record a zero count; empty/null remains the only “none” signal.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B

### F2 — Optimistic delete rollback can wipe concurrent UI edits

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/pantry/PantryManager.tsx:114`
- **Detail**: `handleRemove` snapshots the entire `items` array and restores it on failure. A failed delete after a successful add/edit in the same session drops those writes from the UI (server data is fine). `handleUpdate` can similarly overwrite a newer local edit of the same row.
- **Fix**: Roll back only the affected item id (`filter` / `map` with the saved row). Do not replace the whole list.
  - Strength: Isolates failure to one row; keeps other optimistic successes.
  - Tradeoff: A few lines in two handlers.
  - Confidence: HIGH — classic optimistic-UI pitfall.
  - Blind spot: Two household members editing the same item still last-write-wins on the server (accepted for MVP).
- **Decision**: FIXED

### F3 — 0-row DELETE treated as success

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/services/pantry.ts:79`, `src/pages/api/pantry/[id].ts:83`
- **Detail**: `delete().eq(id).eq(household_id)` with no count returns `error: null` when RLS hides the row or the id is wrong. API still returns 200 `{ data: null }`. Optimistic UI keeps the item gone; refresh may bring it back. PATCH of a missing row uses `.single()` and becomes a generic 500 — inconsistent not-found handling.
- **Fix**: Use `{ count: "exact" }` (or `.select("id")`) on delete and return 404 when count is 0. Map `.single()` 0-row on update to 404, not 500.
  - Strength: Client can toast a real failure and restore the row.
  - Tradeoff: Slightly more PostgREST plumbing.
  - Confidence: HIGH
  - Blind spot: Need to confirm the typed client supports `count: "exact"` without extra headers.
- **Decision**: FIXED

### F4 — Delete has no confirmation step

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/pantry/PantryManager.tsx:273`
- **Detail**: Desired End State asked for “a confirmation step.” Phase 3 contract said “click delete → optimistic remove.” Trash icon deletes immediately. A mis-tap permanently removes the row once the request succeeds.
- **Fix**: Confirm before DELETE (`window.confirm` or alert-dialog), then keep the optimistic remove.
- **Decision**: FIXED

### F5 — Missing Supabase client renders empty pantry

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/pantry.astro:14`
- **Detail**: `loadError` is only set inside `if (supabase && householdId)`. If the client is missing but `householdId` is set, `PantryManager` renders with `[]` — empty pantry, not an error. Query failures are already distinguished (F-01 F2). Layout config banners mitigate.
- **Fix**: Treat `!supabase` as `loadError` (same as the query `catch`).
- **Decision**: FIXED

### F6 — `jsonResponse` duplicated; `update_updated_at` has no REVOKE

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/pantry/index.ts:14`, `src/pages/api/pantry/[id].ts:16`, `supabase/migrations/20260902111000_pantry_items.sql:44`
- **Detail**: Identical `jsonResponse` helper in both API files — first JSON convention in the repo; will copy-paste into S-02. `update_updated_at()` is INVOKER (not DEFINER) so F-01 execute-grant risk does not recur, but no `REVOKE` / `search_path` was applied.
- **Fix**: Extract `jsonResponse` to `src/lib/api.ts` before the next JSON surface. Optionally add a follow-up migration to revoke execute on `update_updated_at()`.
- **Decision**: FIXED
