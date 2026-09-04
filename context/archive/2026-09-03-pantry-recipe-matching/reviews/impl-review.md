<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Pantry-Recipe Matching

- **Plan**: `context/changes/pantry-recipe-matching/plan.md`
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-03
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warning 2 observations

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

### F1 — First visibility refetch is skipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/matches/MatchList.tsx:17`, `46–54`
- **Detail**: `skipFirstVisible` starts `true` and skips the first `visibilitychange` → `visible`. That event typically does **not** fire on mount, so the guard is consumed on the first real tab-return and that return does not refetch. `pageshow` only refetches when `event.persisted` (bfcache). Full navigation to `/dashboard` still SSR-recomputes (the path covered by manual 3.9). Tab-away-and-back while the dashboard stays mounted can show a stale ranking.
- **Fix A ⭐ Recommended**: Remove `skipFirstVisible` and refetch on every `visibilitychange` to `visible`, keeping the `event.persisted` `pageshow` guard.
  - Strength: Matches the plan’s “when the list is on-screen again”; one extra GET only if a browser fires `visible` on mount.
  - Tradeoff: Possible duplicate fetch immediately after SSR in some browsers.
  - Confidence: HIGH — `visibilitychange` on load is uncommon; the missed tab-return is the worse bug.
  - Blind spot: Have not measured which browsers fire `visible` at island mount.
- **Fix B**: Keep the skip, but only if `document.visibilityState === "visible"` at subscribe time (treat mount as already visible; refetch on later hidden→visible).
  - Strength: Avoids a mount-time GET while still catching the first tab-return.
  - Tradeoff: Slightly more state logic; still no trailing-refresh if `inFlight` overlaps (see F2).
  - Confidence: MEDIUM — depends on subscribe timing vs first `visibilitychange`.
  - Blind spot: Hidden-tab first paint (user opens dashboard in a background tab) is untested.
- **Decision**: FIXED via Fix A

### F2 — In-flight refetch drops a overlapping refresh

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/matches/MatchList.tsx:19–22`
- **Detail**: `inFlight` returns immediately without queueing. A `pageshow` (persisted) plus `visibilitychange` in the same tick (Safari bfcache) can drop the second call. Combined with F1, a re-rank can be missed.
- **Fix**: If `inFlight` is true, set a `pending` flag and run one more `refreshMatches` in `finally`.
- **Decision**: FIXED

### F3 — Dashboard loads invite code and matches sequentially

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/dashboard.astro:16–28`
- **Detail**: Invite-code `select` and `listMatches` are awaited in sequence. `listMatches` already `Promise.all`s pantry + recipes. Invite and matches do not depend on each other.
- **Fix**: `Promise.all` the household invite read and `listMatches`.
- **Decision**: FIXED
