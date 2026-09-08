---
change_id: testing-critical-path-coverage
title: Prove matching contract and session-gated `/`
status: implementing
created: 2026-09-07
updated: 2026-09-08
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Critical-path coverage".
Risks covered: #1 ranked list disagrees with pantry/recipe names; #3 guest sees `/` or signed-in redirect loop. Test types planned: unit + one session-level test.
Risk response intent:
- #1: prove unique-name coverage order/scores/missing names from independent fixtures; empty pantry all-zero; zero-overlap at bottom. Challenge: green existing tests ≠ PRD contract. Avoid oracle copied from the scorer.
- #3: prove signed-out `/` never shows pantry/matches; `/auth/signin` is not looped; signed-in session reaches the ranked list. Challenge: path-helper unit tests imply cookie session + middleware work. Avoid a full-app Playwright suite.
After creating the folder, follow the downstream continuation rule.
