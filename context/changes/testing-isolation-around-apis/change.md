---
change_id: testing-isolation-around-apis
title: Prove household isolation, IDOR, and ranked-list refresh after writes
status: implemented
created: 2026-09-08
updated: 2026-09-08
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Isolation around APIs".
Risks covered: #2 (authenticated member of household A sees or changes household B’s pantry, recipes, or matches), #4 (logged-in user mutates another household’s pantry/recipe by sending a client-chosen id or household id), #5 (cook edits pantry or a recipe, returns to `/`, and still sees the old ranking). Test types planned: integration.
Risk response intent: #2 prove member of A cannot read or write B’s pantry, recipes, or matches; #4 prove PUT/PATCH/DELETE with another household’s resource id is 403/404 and create ignores a client-supplied household id; #5 prove after a pantry/recipe write the next ranked-list load (SSR or on-screen refetch) shows new scores/missing names.
After creating the folder, follow the downstream continuation rule.
