# Critical-path coverage — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Rollout Phase 1 of `context/foundation/test-plan.md`: prove that the ranked list follows the cook’s pantry/recipe names (Risk #1), and that middleware still gates `/` so a guest never reaches the household page and a signed-in cook is not bounced through `/auth/signin` (Risk #3). Existing green tests do not fully encode that contract.

## Starting Point

`matchRecipes` already has a colocated Jest suite (unique-name coverage, empty pantry, Check/qty). Gaps: explicit zero-overlap-at-bottom vs a full match, and recipe-original spelling `"Eggs"`. `isProtectedPath` is tested; the middleware `user` × path redirect is not. Jest cannot import middleware without Astro mocks.

## Desired End State

`npm test` fails if ranking hides zeros or drops recipe spelling, or if the unauthenticated `/` redirect rule regresses. Cookbook §6.1 and §6.3 tell the next agent where those tests live and not to reach for Playwright.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Matching oracle | Live Check/qty (`c3b9bc5`), not revert | Cooks already see Check in the UI; do not assert “qty ignored.” | Plan (research recommended) |
| Session testability | Extract `shouldRedirectUnauthenticated` | Jest stays off `astro:middleware`; middleware stays a one-line call. | Plan |
| Matching gaps this change | Zero-overlap-at-bottom + original spelling only | Rest of the unique-name / Check suite already exists. | Plan |
| Session cases | Guest `/` redirect; `/auth/signin` next; signed-in `/` next | Matches test-plan prove set; no `/join` or cookie cases. | Plan |
| Cheapest ranking layer | Unit on `matchRecipes` | SSR/API/UI do not re-sort. | Research |
| Playwright / CI YAML | Out of scope | Lesson + cost × signal; `npm test` already in CI. | Research / test-plan |

## Scope

**In scope:** Two matching fixtures; gate helper + three Jest cases; cookbook §6.1 and §6.3.

**Out of scope:** Playwright; mocking middleware; isolation/IDOR; list-after-write; freshness; more Check/qty rows; test-plan §1–§5 edits.

## Architecture / Approach

Ranking stays a pure function with independent name fixtures. Auth gate stays two-layer: `isProtectedPath` plus a new boolean `shouldRedirectUnauthenticated(pathname, user)` that middleware calls before `redirect("/auth/signin")`. No Astro page tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Matching oracle gaps | Full/partial/zero order + `"Eggs"` spelling | Oracle copied from the scorer |
| 2. Session gate helper | Extracted boolean + three Jest cases | Importing middleware instead of extracting |
| 3. Cookbook §6.1 / §6.3 | Fill TBD placeholders | Rewriting frozen strategy sections |

**Prerequisites:** Research complete; test-plan Phase 1 `researched`.
**Estimated effort:** One short implement pass across three phases (~one session).

## Open Risks & Assumptions

- Check/qty remains product law; a later product revert would need a new change, not this suite.
- Helper tests do not see live cookies; Playwright stays a later-layer option if Workers cookie behavior diverges.

## Success Criteria (Summary)

- `npm test` locks the two matching gaps and the three session cases.
- Middleware uses the helper for the unauthenticated redirect.
- Cookbook §6.1 / §6.3 are usable recipes, not TBD.
