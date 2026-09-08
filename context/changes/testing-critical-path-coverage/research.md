---
date: 2026-09-07T14:36:26+02:00
researcher: Marcin
git_commit: 4f21612990554a446c947953fb4ec2ba5723e048
branch: 10x-test-plan
repository: co-na-obiad
topic: "Ground rollout Phase 1 — matching contract (Risk #1) and session-gated `/` (Risk #3)"
tags: [research, codebase, matching, middleware, protected-routes, test-plan, jest]
status: complete
last_updated: 2026-09-07
last_updated_by: Marcin
---

# Research: Ground rollout Phase 1 — matching contract and session-gated `/`

**Date**: 2026-09-07T14:36:26+02:00
**Researcher**: Marcin
**Git Commit**: [4f21612990554a446c947953fb4ec2ba5723e048](https://github.com/MarcinG-DKA/co-na-obiad/commit/4f21612990554a446c947953fb4ec2ba5723e048)
**Branch**: 10x-test-plan
**Repository**: co-na-obiad

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (“Critical-path coverage”).

Risks to verify: **#1** ranked list disagrees with pantry/recipe names; **#3** guest sees `/` or signed-in redirect loop.

Risk response guidance to verify, not blindly accept:

- **#1**: prove unique-name coverage order/scores/missing names from independent fixtures; empty pantry all-zero; zero-overlap at bottom. Challenge: green existing tests ≠ PRD contract. Avoid oracle copied from the scorer.
- **#3**: prove signed-out `/` never shows pantry/matches; `/auth/signin` is not looped; signed-in session reaches the ranked list. Challenge: path-helper unit tests imply cookie session + middleware work. Avoid a full-app Playwright suite.

Hot-spot directories (likelihood evidence, not anchors): `src/lib`, `src/lib/services`, `src/pages`, middleware churn.

Stack: Jest + ts-jest, mock `@/lib/supabase`, no e2e yet. Module 3 Lesson 1 must not add Playwright/CI YAML.

## Summary

Neither risk is speculative as a **regression class**. Both are currently **mitigated in code** more than the test plan assumed, with two important corrections.

**Risk #1.** Wrong order / missing names / hidden zeros / empty-pantry scores fail in [`matchRecipes`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L110-L155). SSR and `GET /api/matches` only call `listMatches` → loaders → scorer. `MatchList` does not hide zeros or re-sort. Existing `matching.test.ts` already uses pantry/recipe **name fixtures** (omelette vs cake, empty pantry, unique-set) — not a pure implementation mirror — but expected scores are **hand-written fractions of the live formula**. Live scoring is **not** archived S-03 “names only, quantities ignored”: commit `c3b9bc5` added `ok` / `missing` / `check` and half-credit for Check. Test-plan “quantities ignored” is **stale**. Cheapest layer remains **unit tests on `matchRecipes`**.

**Risk #3.** Guest `/` is redirected in middleware **before** `index.astro` runs. Exact `/` vs prefix lives in `isProtectedPath`; `/auth/signin` is excluded. Sign-in lands on `/`; sign-out lands on `/auth/signin` (avoids bounce). Path-helper tests lock the historical `startsWith("/")` footgun; they **do not** prove `getUser` → `locals.user` → redirect. `index.astro` does not check `user`; it only loads matches when `householdId` is set (middleware sets that only for authenticated users). Cheapest gap-fill: **one Jest session-level test of middleware** (mock `astro:middleware` + `@/lib/supabase`). Playwright is **not** required for Phase 1 and is blocked by the lesson.

Hot-spot citations are not misleading: ranking lives in `src/lib/services`; the `/` gate wiring lives in `src/middleware.ts` + `src/lib/protected-routes.ts` (not in `src/pages` churn).

## Detailed Findings

### Risk #1 — matching contract

#### Failure path

| Step | Where |
|------|--------|
| Session household | [`src/middleware.ts:24-37`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/middleware.ts#L24-L37) sets `locals.householdId` |
| Homepage SSR | [`src/pages/index.astro:20-41`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/index.astro#L20-L41) `listMatches(supabase, householdId)` → [`MatchList`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/index.astro#L83) |
| JSON API | [`src/pages/api/matches/index.ts:8-25`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/matches/index.ts#L8-L25) 401/400/500 then `listMatches` |
| Orchestrate | [`listMatches`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L157-L162) `Promise.all` pantry + recipes |
| Load | [`listPantryItems`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/pantry.ts#L23-L28) / [`listRecipesWithIngredients`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/recipe.ts#L145-L154) `.eq("household_id", householdId)` |
| Score + sort | [`matchRecipes`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L110-L155) |

DTO: `{ recipeId, title, score, matchedNames, missingNames, checkNames }`.

#### Live scoring (not archived S-03)

- Normalize: `trim` + `toLowerCase` ([`matching.ts:34-36`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L34-L36)).
- Unique recipe needs via `groupRecipeNeeds`; empty unique set → score `0`.
- Per-need status via `classifyNeed` ([`matching.ts:90-108`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L90-L108)): no pantry name → `missing`; unit mismatch / mixed units → `check`; same unit + enough qty (or recipe qty null) → `ok`; same unit but pantry qty insufficient or pantry qty null vs recipe qty → `missing`.
- Score: `(ok + 0.5 × check) / uniqueCount` ([`matching.ts:130-131`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L130-L131)).
- Sort: score desc, missing count asc, check count asc, `title.localeCompare` ([`matching.ts:143-154`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L143-L154)).
- Name lists keep recipe first-occurrence `need.original`.

Empty pantry: every need `missing`, all scores `0`. Zero-overlap rows stay in the array; sort puts them after higher scores. **Quantities/units are not ignored.**

Name-only fixtures (`quantity: null`, `unit: null` both sides) still take the `ok` path when the name exists — so omelette/cake tests still encode unique-name coverage.

#### UI

[`MatchList.tsx:102-124`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/components/matches/MatchList.tsx#L102-L124) maps the array in order, does not filter `score === 0`, shows Missing/Check. Percent is `Math.round(score * 100)` (display only). Empty UI is **no recipes**, not all-zero scores. Refetch is Risk #5, not #1.

#### Existing tests vs oracle problem

[`src/lib/services/matching.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.test.ts) (full):

| Case | Proves | Oracle |
|------|--------|--------|
| omelette vs cake (`:54-71`) | unique-name ranking + missing lists | Independent name fixtures; expected `2/3`, `1/3` |
| Eggs→eggs (`:73-78`) | case-insensitive match | Independent; does **not** prove recipe spelling `"Eggs"` preserved when pantry is `"eggs"` |
| empty pantry (`:86-96`) | all scores 0 + missing names | Independent |
| unique-set duplicates (`:102-108`) | denominator is unique names | Independent |
| sort ties (`:119-127`) | partial above two zeros (title order) | Weak explicit “zero-overlap at bottom vs full match” |
| qty/Check cases (`:129-182`) | live `c3b9bc5` law | Fixture-driven; expected `0.5` / `0.75` track the formula |
| `listMatches` (`:191-231`) | parallel load + one hardcoded `RecipeMatch` | Wiring; not an independent ranking oracle |

[`matches-api.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/matches/matches-api.test.ts) **mocks `listMatches`** — envelope/auth only. Does not protect Risk #1.

**Challenge confirmed:** a green suite proves the **current** scorer (including Check/qty), not the archived S-03 / test-plan “quantities ignored” wording. Name-only cases are still the right independent-oracle template.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove unique-name order/scores/missing; empty pantry all-zero; zero-overlap at bottom | Keep. Strengthen explicit zero-overlap-below-full and original-spelling. |
| Challenge: green tests ≠ PRD contract | Confirmed. PRD has no formula; S-03 ≠ live scorer. |
| Cheapest layer: unit on scorer | Confirmed. API/SSR/UI are passthrough for ranking math. |
| Anti-pattern: oracle copied from scorer | Still avoid pasting scorer output. Existing name fixtures are OK; qty/Check literals encode live formula — treat as **current product law** unless planning reverts `c3b9bc5`. |
| “Quantities ignored” | **Incorrect for live code.** Backport test-plan Risk #1 / Context / Prove cells. |

Hot-spot `src/lib` / `src/lib/services`: **correct** for this risk. `src/pages` / `src/components` are not the ranking-math failure site.

#### Cheapest Phase 1 additions (behavior)

1. Explicit fixture: full overlap, partial, zero-overlap — order ends with zero-overlap.
2. Recipe `"Eggs"` + pantry `"eggs"` → `matchedNames` keeps `"Eggs"`.
3. Align prove column with live qty/Check (do not add tests that assert “qty ignored” against live code unless the product decision is to revert).
4. Do not use mocked `listMatches` API tests as the Risk #1 oracle.

---

### Risk #3 — session-gated `/`

#### Guest → `/`

[`src/middleware.ts:41-43`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/middleware.ts#L41-L43): if `isProtectedPath(pathname) && !locals.user` → `redirect("/auth/signin")`. No `next()`; `index.astro` does not run.

[`isProtectedPath`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/protected-routes.ts#L10-L16): exact `/` or `""` after trailing-slash strip (not applied to `/` itself, length 1); prefixes `/join`, `/pantry`, `/recipes` including nested. `/auth/signin` is **not** protected.

If middleware were skipped, [`index.astro:20-84`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/index.astro#L20-L84) still only loads matches when `householdId` is set. Middleware sets `householdId` only when `user` is present (`:26-38`). Guest leak of pantry/matches requires **both** a failed auth gate **and** a populated `householdId`. “Guest currently sees matches on `/`” is **not** a present bug; it is a regression of the middleware wiring.

#### Signed-in → `/` and loop

- Sign-in success: [`signin.ts:19`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/auth/signin.ts#L19) `redirect("/")`.
- Sign-out: [`signout.ts:9`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/auth/signout.ts#L9) `redirect("/auth/signin")` — **not** `/` (archive: bounce/flash).
- Session: Supabase SSR cookies via [`createClient`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/supabase.ts#L6-L20) (`astro:env/server`); household cookie `current_household_id` httpOnly / lax ([`household.ts:4,13-25`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/household.ts#L4-L25)).
- Historical loop: putting `"/"` on a `startsWith` list matches `/auth/signin`. Fixed by extracting exact-match helper (change-homepage). Path tests lock that.

No “already signed-in, bounce off auth pages” redirect. Signed-in `/auth/signin` is allowed and does not loop.

#### Existing tests

[`protected-routes.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/protected-routes.test.ts) (full, 27 lines): exact `/` vs `/auth/signin`; auth/API negatives; prefix `/join|/pantry|/recipes` including nested; `/dashboard` not gated.

**Not tested:** middleware `onRequest`, cookies, `getUser` null vs user, redirect `Location`, `index.astro` without user, sign-in/sign-out landings, trailing-slash on `/join/`.

No Playwright. No `middleware*.test.ts`.

#### Can Jest see the cookie session?

Import graph:

```
middleware.ts
  astro:middleware          — Jest has no mapper (jest.config.cjs maps @/ only)
  @/lib/supabase.ts         — astro:env/server (must mock, same as API tests)
  @/lib/protected-routes.ts — pure, already tested
  @/lib/services/household.ts — cookie helpers are pure; listMemberships needs client
```

Jest **cannot** import middleware as-is. Same pattern as API tests works if tests **mock `astro:middleware`** (`defineMiddleware: (fn) => fn`) **and** `@/lib/supabase`, then call `onRequest` with a fake `context` (`url.pathname`, `locals`, `cookies`, `redirect`, `request`) and `next`.

That asserts session **behavior** (guest `/` → redirect; signed-in `/` → `next()`; `/auth/signin` → `next()`), not a live Cloudflare cookie round-trip.

Playwright would see real Set-Cookie. **Not needed** to challenge “path-helper green ⇒ gate works.” Lesson 1 forbids adding Playwright in this change.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove: signed-out `/` never shows pantry/matches; signin not looped; signed-in reaches ranked list | Keep as prove set. Guest data leak also requires `householdId`; primary control is middleware redirect. |
| Challenge: path-helper ≠ cookie session + middleware | **Confirmed.** Helper only locks exact vs prefix. |
| Cheapest: path-helper (exists) + one session-level test | **Confirmed, as Jest-mocked middleware**, not Playwright. |
| Anti-pattern: full Playwright suite | Confirmed. No Playwright in repo; CI is lint/test/build. |
| E2e required? | **No for Phase 1.** Later-layer only if cookie/runtime gaps remain after Jest. |

Hot-spot: failure for this risk is **`protected-routes.ts` (rule) + `middleware.ts` (wiring)**. `src/pages` churn is misleading as the **anchor**; index.astro is a weak second line (no `user` check, but no `householdId` without auth).

Risk #3 is **not speculative** as a regression of the prefix-`/` loop or of dropping the middleware `isProtectedPath` call. It **is** speculative as “guests currently see matches.”

---

### Test infrastructure (Phase 1 constraints)

- Jest 30 + ts-jest, `testEnvironment: node`, `**/*.test.ts` under `src/` ([`jest.config.cjs`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/jest.config.cjs)).
- API tests: `jest.mock("@/lib/supabase")`, import real handlers, hand-built `APIContext` with `locals` + `Request` ([`matches-api.test.ts:5-45`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/matches/matches-api.test.ts#L5-L45)). Middleware is bypassed.
- `index.astro` is not Jest-importable (Astro page; testMatch is `*.test.ts` only).
- CI already runs `npm test` (`.github/workflows/ci.yml`). No new YAML for Jest additions.
- Lesson (`context/foundation/lessons.md`): colocated `*.test.ts` for service/API; mock `@/lib/supabase`.
- Cookbook fill-in after implement: colocate, `npm test`, mock supabase at the env edge, never load `astro:env`.

## Code References

- [`src/lib/services/matching.ts:34-36`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L34-L36) — `normalizeName`
- [`src/lib/services/matching.ts:90-108`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L90-L108) — `classifyNeed`
- [`src/lib/services/matching.ts:110-155`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L110-L155) — `matchRecipes`
- [`src/lib/services/matching.ts:157-162`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.ts#L157-L162) — `listMatches`
- [`src/lib/services/matching.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/services/matching.test.ts) — scorer suite
- [`src/pages/api/matches/index.ts:8-28`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/matches/index.ts#L8-L28) — GET matches
- [`src/pages/index.astro:20-84`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/index.astro#L20-L84) — SSR matches
- [`src/components/matches/MatchList.tsx:102-124`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/components/matches/MatchList.tsx#L102-L124) — no hide/re-sort
- [`src/lib/protected-routes.ts:10-16`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/protected-routes.ts#L10-L16) — `isProtectedPath`
- [`src/lib/protected-routes.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/protected-routes.test.ts) — path helper only
- [`src/middleware.ts:11-51`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/middleware.ts#L11-L51) — getUser, household cookie, protect
- [`src/pages/api/auth/signin.ts:19`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/auth/signin.ts#L19) — redirect `/`
- [`src/pages/api/auth/signout.ts:9`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/pages/api/auth/signout.ts#L9) — redirect `/auth/signin`
- [`src/lib/supabase.ts:3-10`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/src/lib/supabase.ts#L3-L10) — `astro:env/server`
- [`jest.config.cjs`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4f21612990554a446c947953fb4ec2ba5723e048/jest.config.cjs) — no `astro:*` mapper

## Architecture Insights

- Ranking is a pure in-memory function after two household-scoped reads. Product trust in “what can I cook” is almost entirely `matchRecipes` + fixture-backed Jest.
- Check half-credit extended coverage without updating `context/foundation/test-plan.md`.
- Auth gate is a two-layer design: pure path matcher (testable) + middleware session wiring (untested). Homepage is not a third auth check.
- API handler tests never run middleware; they inject `locals`. A middleware test is a different layer from API 401 tests.

## Historical Context (from prior changes)

- [`context/archive/2026-09-03-pantry-recipe-matching/research.md`](../../archive/2026-09-03-pantry-recipe-matching/research.md) — coverage not Jaccard; trim+lowercase; **ignore qty/unit**; refetch after pantry edits.
- [`context/archive/2026-09-03-pantry-recipe-matching/plan.md`](../../archive/2026-09-03-pantry-recipe-matching/plan.md) — unique-name coverage; empty pantry all-zero; zeros at bottom; original spelling; Jest scorer promised; Playwright deferred. Impl-review did **not** flag scorer tests as mirrors (it flagged MatchList refetch).
- Commit `c3b9bc5` changed the scorer to qty/Check **without** a new archived change documenting the contract shift.
- [`context/archive/2026-09-04-change-homepage/plan.md`](../../archive/2026-09-04-change-homepage/plan.md) — exact `/` never prefix; sign-out not `/`; extract `isProtectedPath` + Jest; **no middleware tests**; Playwright out of scope.

## Related Research

- `context/archive/2026-09-03-pantry-recipe-matching/research.md`
- `context/changes/pantry-recipe-matching/research.md` (live duplicate of matching research)
- `context/foundation/test-plan.md` §2 Risks #1 and #3

## Test-plan corrections (for `/10x-test-plan` backport — §2 wording/guidance only, no file anchors)

1. Risk #1 Context / Prove: drop “quantities ignored”; live contract is unique-name coverage **plus** Check @ 0.5 and qty/unit sufficiency (`c3b9bc5`).
2. Risk #1 cheapest layer stays unit on the scorer; existing suite is mostly independent name fixtures, not a blank slate.
3. Risk #3 cheapest session-level test is **Jest-mocked middleware**, not e2e. Path-helper hot-spot is `src/lib` + middleware, not `src/pages` as the failure site.
4. Risk #3 “guest sees household data” as a **present** leak is overstated: `index.astro` needs `householdId`, which middleware only sets for a user. Keep as **regression of middleware wiring**.

## Open Questions

1. Is qty/Check scoring intentional product law for Phase 1 prove, or drift to revert? Research cannot decide; `/10x-plan` must pick one oracle. **Recommendation:** treat live code as the contract (cooks already see Check lines in the UI) unless the user wants a product revert.
2. Extract a tiny `guardProtectedRequest(pathname, user)` from middleware vs mock `astro:middleware` — planning choice; both stay Jest.
3. Optional later: one Playwright smoke for real cookies — **not** this change.
