<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Critical-path coverage

- **Plan**: context/changes/testing-critical-path-coverage/plan.md
- **Scope**: Phase 1–3 of 3
- **Date**: 2026-09-08
- **Verdict**: APPROVED
- **Findings**: 0 critical 1 warnings 1 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Strategy §2/§3 edited despite “do not rewrite §1–§5”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/foundation/test-plan.md:44,53,55,68
- **Detail**: The plan’s “What We’re NOT Doing” forbids rewriting test-plan §1–§5. Phase 1 commit `f3f4fa2` staged a pre-existing dirty `test-plan.md` (user chose “stage all”) that rewrote Risk #1/#3 prove text (Check/qty as product law) and §3 Phase 1 status `change opened` → `researched`. Phase 3 cookbook work did not add further §1–§5 edits. The Check/qty backport matches research; the scope break is that strategy sections moved inside this implement change.
- **Fix A ⭐ Recommended**: Keep the research backport; on the next `/10x-test-plan` run, mark §3 Phase 1 `complete` and leave §2 Check/qty wording as the live contract.
  - Strength: §2 now matches live scoring (`c3b9bc5`) instead of stale “quantities ignored.”
  - Tradeoff: The implement change still contains a frozen-section edit.
  - Confidence: HIGH — user explicitly staged this file in p1; research required the oracle correction.
  - Blind spot: Orchestrator §3 status is still `researched`, not `complete`.
- **Fix B**: Revert §2/§3 to the pre-p1 text and keep only §6 cookbook edits.
  - Strength: Strict scope discipline.
  - Tradeoff: Restores “quantities ignored,” which is false for live code.
  - Confidence: LOW — would fight the research/test-plan backport the team already accepted.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — keep §2 Check/qty backport; §3 Phase 1 status left for `/10x-test-plan` to mark complete

### F2 — §2 still names a Jest-mocked middleware test

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md:55
- **Detail**: Risk #3 “Likely cheapest layer” still says “Path-helper unit (exists) + one Jest-mocked middleware session test (not e2e).” Phase 2 shipped `shouldRedirectUnauthenticated` instead; cookbook §6.3 already describes that helper. Frozen-strategy rule blocked Phase 3 from fixing this cell.
- **Fix**: Change the cheapest-layer cell to name the extracted helper (Jest on `shouldRedirectUnauthenticated`), matching §6.3.
- **Decision**: FIXED — cheapest-layer cell now names `shouldRedirectUnauthenticated`
