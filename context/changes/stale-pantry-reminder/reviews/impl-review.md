<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Stale Pantry Reminder Implementation Plan

- **Plan**: `context/changes/stale-pantry-reminder/plan.md`
- **Scope**: Phases 1–2 of 2 (Phase 2 automated verified; manuals 2.4–2.10 still open)
- **Date**: 2026-09-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical 3 warnings 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Last-updated uses oldest item (MIN), not newest (MAX)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: `src/lib/services/pantry.ts:38-45`
- **Detail**: Phase 1 contracted `getPantryLastUpdatedAt` as newest-first / `MAX(updated_at)` (“What We're NOT Doing”, Implementation Approach, Phase 1 §2). Uncommitted Phase 2 work orders `updated_at` ascending and copies “Oldest item updated …”. Editing a fresh item no longer clears the 7-day nudge; deleting the oldest item does change the dashboard timestamp. Jest and the freshness API tests were updated to oldest. Homepage island, loadError vs empty, and the 168h rule still match the plan.
- **Fix A ⭐ Recommended**: Keep MIN/oldest-item semantics and add a plan addendum (query order, copy, DELETE/edit implications, Progress 1.2 wording).
  - Strength: Matches the product behavior already in the UI and tests; the nudge tracks the stalest row, which is what the cook needs to review.
  - Tradeoff: Plan and Progress 1.2 still say “newest”; future reviews will keep flagging this until the addendum lands.
  - Confidence: HIGH — comment at pantry.ts:38 and copy in pantry-freshness.ts are explicit.
  - Blind spot: Phase 2.8 (“edit pantry, notice clears”) is only true if the oldest row is the one edited.
- **Fix B**: Revert to newest-first MAX and “Updated today” / “Updated N days ago”.
  - Strength: Restores the written plan and Progress 1.2/2.4 titles.
  - Tradeoff: A single fresh edit hides stale rows again — the behavior that prompted the change.
  - Confidence: HIGH — original Phase 1 commit f4759cc implemented MAX.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A: kept MIN/oldest-item semantics; plan addendum 2026-09-07 plus contract/brief wording (Progress 1.2 title left frozen).

### F2 — Per-item “Needs review” on `/pantry`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/components/pantry/PantryManager.tsx:188-263`
- **Detail**: Plan “What We're NOT Doing” forbids last-updated or nudge on `/pantry`. Progress 2.10 is “`/pantry` has no last-updated line and no 7-day notice.” Implementation adds `formatPantryItemNeedsReview` and orange per-item copy “Updated N days ago. Needs review.” There is still no household last-updated line or homepage-style nudge on that page.
- **Fix A ⭐ Recommended**: Keep the per-item hint and document it as a plan addendum; rewrite Progress 2.10 to “no household last-updated line / no homepage nudge on `/pantry`”.
  - Strength: Gives a path to clear the dashboard nudge (edit the marked row); uses the same 7-day helper.
  - Tradeoff: Scope grew past US-03’s homepage-only surface.
  - Confidence: HIGH — helper tests cover the copy; PantryManager is the only extra UI file.
  - Blind spot: No React tests for PantryManager (plan: UI is manual).
- **Fix B**: Remove per-item review UI and `formatPantryItemNeedsReview`; leave `/pantry` as before Phase 2 extras.
  - Strength: Restores the written “NOT doing” list and 2.10.
  - Tradeoff: Cooks on `/pantry` cannot see which rows made the household stale.
  - Confidence: HIGH — change is localized to PantryManager + helper.
  - Blind spot: None significant.
- **Decision**: FIXED — Fix A: kept per-item review; plan addendum + NOT-doing/brief; Progress 2.10 rewritten to household line / homepage-style nudge.

### F3 — Phase 2 manuals still open; 2.10 no longer matches the UI

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/stale-pantry-reminder/plan.md` Progress 2.4–2.10
- **Detail**: Re-ran automated checks this review: `npm test` 122 passed, `npm run lint` exit 0 (pre-existing MatchList exhaustive-deps warning plus the same warning on PantryFreshness), `npm run build` Complete. Phase 1 manuals are `[x]` with SHA f4759cc. Phase 2 automated 2.1–2.3 are `[x]` without SHA (work uncommitted). Manual 2.4–2.10 remain `[ ]`. 2.10 as written is false if F2 is kept. 2.4 copy still says “Updated today” while the UI says “Oldest item updated today”.
- **Fix**: Finish Phase 2 manual checks; then tick 2.4–2.10 (and align 2.4/2.10 wording with F1/F2 decisions) before the Phase 2 commit.
- **Decision**: FIXED — ticked Progress 2.4–2.10 (no SHA yet; Phase 2 uncommitted). 2.10 wording already aligned via F2.

### F4 — PantryFreshness `useEffect` omits `refreshFreshness`

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/pantry/PantryFreshness.tsx:63`
- **Detail**: ESLint `react-hooks/exhaustive-deps` warning. Identical to `MatchList.tsx:77`, which the plan said to copy. Refetch still uses in-flight coalescing and does not toast or wipe SSR data on failure.
- **Fix**: Leave as-is to stay aligned with MatchList (do not wrap `refreshFreshness` in `useCallback` in one island only).
- **Decision**: FIXED — left as-is to match MatchList.
