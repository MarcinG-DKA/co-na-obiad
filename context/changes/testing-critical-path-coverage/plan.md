# Critical-path coverage Implementation Plan

## Overview

Close test-plan rollout Phase 1: prove the matching oracle on `matchRecipes` with two missing independent fixtures, and prove that unauthenticated `/` is gated without looping `/auth/signin`. Session-level coverage is a tiny extracted helper plus colocated Jest — not Playwright and not new CI YAML.

## Current State Analysis

Matching ranking is a pure function. SSR (`src/pages/index.astro`) and `GET /api/matches` call `listMatches` → household loaders → `matchRecipes`. `MatchList` maps the array in order and does not hide zeros or re-sort. Live scoring (commit `c3b9bc5`) is unique-name coverage plus Check at half credit and qty/unit sufficiency — not archived S-03 “quantities ignored.” `src/lib/services/matching.test.ts` already covers omelette-vs-cake, empty pantry, unique-set, several Check/qty rows, and a weak sort (partial above two zeros). Two prove gaps remain: explicit full + partial + zero-overlap on one list, and recipe-first spelling (`"Eggs"` kept when pantry is `"eggs"`). The existing case-insensitive test is the inverse (pantry `"Eggs"`, recipe `"eggs"`). API tests mock `listMatches` and are not a ranking oracle.

The `/` gate is two layers. `isProtectedPath` (exact `/`, prefixes `/join|/pantry|/recipes`) is locked in `src/lib/protected-routes.test.ts`. Middleware (`src/middleware.ts:41-43`) redirects when that helper is true and `locals.user` is missing. Nothing tests that wiring. Jest cannot import `src/middleware.ts` without mapping `astro:middleware` and mocking `@/lib/supabase` (`astro:env/server`). Path-helper green therefore does not prove the session gate.

Cookbook §6.1 and §6.3 are still `TBD`. CI already runs `npm test` after lint; adding Jest cases does not need new workflow YAML.

## Desired End State

A failing change to ranking order, zero-overlap placement, or recipe-original spelling is caught by `npm test`. A failing change that would let a guest through on `/`, loop `/auth/signin`, or bounce a signed-in cook off `/` is caught by `npm test` on a pure helper that middleware actually calls. `context/foundation/test-plan.md` §6.1 and §6.3 name those patterns so later work copies them.

**Verification:** `npm test` and `npm run lint` pass; matching suite includes the two new fixtures; protected-routes suite includes the three session cases; middleware uses the extracted helper; §6.1 and §6.3 are no longer placeholders.

### Key Discoveries:

- Ranking math lives only in `matchRecipes` (`src/lib/services/matching.ts:110-155`). Name lists keep recipe first-occurrence `need.original` (`matching.ts:119-127`).
- Existing `matching.test.ts:73-78` proves case-insensitive match but not original spelling; `matching.test.ts:119-127` proves partial above two zeros, not full vs zero-overlap on the same list.
- Gate rule: `src/middleware.ts:41-43` (`isProtectedPath && !locals.user` → `redirect("/auth/signin")`). `/auth/signin` is not a protected path (`protected-routes.ts:10-16`).
- Jest `moduleNameMapper` maps `@/` only (`jest.config.cjs`). Importing middleware in tests is the expensive path; extracting a helper next to `isProtectedPath` is the cheap one (same extraction pattern as change-homepage).
- Guest data leak on `/` also needs `householdId`; middleware sets that only when `user` is set (`middleware.ts:26-38`). Primary control is still the redirect before `index.astro` runs.

## What We're NOT Doing

- Playwright, browser e2e, or any new GitHub Actions YAML.
- Mocking `astro:middleware` or importing `src/middleware.ts` in Jest.
- Testing household-cookie resolution, `getUser` failure, guest `/join`, or `index.astro` itself.
- Adding more Check/qty rows, reverting `c3b9bc5`, or asserting archived S-03 “quantities ignored.”
- Using `matches-api.test.ts` (mocked `listMatches`) as a ranking oracle.
- Isolation/IDOR, list-after-write re-rank, freshness (rollout Phases 2–3).
- Rewriting test-plan §1–§5.

## Implementation Approach

Cost × signal, in risk order: extend the existing matching unit suite first (cheapest signal for Risk #1), then extract a boolean gate helper so Risk #3 is testable without the Astro runtime, then fill cookbook §6 from what actually shipped.

Keep existing Check/qty tests as live product law. New matching fixtures stay independent (hand-built pantry/recipe names, expected order and spelling — not pasted scorer output).

## Critical Implementation Details

### Matching oracle is live Check/qty, not archived S-03

Do not add or change tests to assert “quantities ignored.” Existing Check/qty cases in `matching.test.ts` stay. Name-only fixtures (`quantity: null`, `unit: null`) still take the `ok` path when the name exists; that is how omelette/cake already encode unique-name coverage.

### Do not “fix” the inverse Eggs case

`matchRecipes(pantry("Eggs"), [recipe(..., "eggs")])` asserting `matchedNames: ["eggs"]` must remain. The new case is recipe `"Eggs"` + pantry `"eggs"` → `matchedNames: ["Eggs"]`. Replacing one with the other leaves the spelling gap.

### Session tests never import middleware

The helper lives in `src/lib/protected-routes.ts`. Middleware becomes a one-line call. Tests cover the helper’s three cases. That is the session-level proof for this rollout phase.

---

## Phase 1: Matching oracle gaps

### Overview

Close the two matching prove gaps from research. Cost × signal: unit tests on `matchRecipes` (API/SSR/UI are passthrough for ranking math).

- **Behavior asserted:** On one pantry/recipe list, full overlap ranks above partial, and zero-overlap is last with score `0`. Recipe ingredient spelling `"Eggs"` is kept in `matchedNames` when the pantry row is `"eggs"`.
- **Regression caught:** Sort that hides zeros or treats zero-overlap as equal to a full match; `normalizeName` leaking into displayed matched names.
- **Research source:** `context/changes/testing-critical-path-coverage/research.md` Risk #1 cheapest additions (1) and (2); `matching.ts:110-155`, `matching.test.ts` gap table.
- **Edge/boundary:** Zero-overlap recipe shares no normalized names with the pantry (not “partial with a long missing list”). Spelling case is recipe-original vs pantry-normalized, not the existing inverse.
- **Anti-pattern avoided:** Oracle copied from the scorer (no `classifyNeed` / formula paste). Do not mock `listMatches`.

### Changes Required:

#### 1. Explicit full / partial / zero-overlap order

**File**: `src/lib/services/matching.test.ts`

**Intent**: Make “zero-overlap at the bottom vs a full match” a first-class fixture, which the current equal-score title sort does not prove.

**Contract**: One `it` that feeds a single pantry and three recipes: full name overlap, partial overlap, zero overlap. Assert `recipeId` (or title) order ends with the zero-overlap recipe, that row’s `score` is `0`, and the full-overlap row is first. Reuse existing `pantry` / `recipe` helpers. Name-only rows (null qty/unit) are enough; do not invent Check/qty here.

#### 2. Recipe-original spelling in `matchedNames`

**File**: `src/lib/services/matching.test.ts`

**Intent**: Prove displayed matched names follow the recipe’s first-occurrence spelling, not the pantry’s.

**Contract**: One `it` with pantry `"eggs"` and a recipe whose ingredient name is `"Eggs"`. Assert `matchedNames` equals `["Eggs"]`, score is a full match, `missingNames` and `checkNames` are empty. Leave `matching.test.ts:73-78` unchanged.

### Success Criteria:

#### Automated Verification:

- `src/lib/services/matching.test.ts` contains both new cases (full/partial/zero-overlap order; recipe `"Eggs"` spelling).
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- The two new cases use independent pantry/recipe name fixtures (readable expected order/spelling, not copied scorer internals).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Session gate helper

### Overview

Extract the unauthenticated-redirect decision so Jest can challenge “path-helper green ⇒ middleware gate works” without `astro:middleware`.

- **Behavior asserted:** Guest `/` requires a sign-in redirect; `/auth/signin` does not (no loop); signed-in `/` does not (cook can reach the ranked list).
- **Regression caught:** Dropping the `isProtectedPath` call in middleware; putting `"/"` back on a prefix list so `/auth/signin` looks protected; treating a present user as unauthenticated on `/`.
- **Research source:** `research.md` Risk #3; `middleware.ts:41-43`; `protected-routes.ts:10-16`; open question (2) resolved as extract-helper.
- **Edge/boundary:** `/auth/signin` with `user === null` must still be “do not redirect.” Signed-in is any truthy user object, not a full Supabase session mock.
- **Anti-pattern avoided:** Full-app Playwright suite; Jest import of `src/middleware.ts`; extra cases (`/join`, cookies, `getUser` throw).

### Changes Required:

#### 1. Pure gate helper

**File**: `src/lib/protected-routes.ts`

**Intent**: Own `pathname × user-present` in the same module as `isProtectedPath` so the session rule is unit-testable.

**Contract**: Export a function that returns whether middleware should redirect to sign-in. True only when `isProtectedPath(pathname)` and `user` is nullish. Suggested name `shouldRedirectUnauthenticated`; keep the boolean — do not perform the redirect here.

```ts
export function shouldRedirectUnauthenticated(
  pathname: string,
  user: unknown,
): boolean
```

#### 2. Thin middleware call

**File**: `src/middleware.ts`

**Intent**: Keep session/household loading as today; stop inlining the gate boolean.

**Contract**: Replace `isProtectedPath(context.url.pathname) && !context.locals.user` with the helper. On true, still `return context.redirect("/auth/signin")`. Do not change `getUser`, household cookie, or `next()` header copy.

#### 3. Three session-level cases

**File**: `src/lib/protected-routes.test.ts`

**Intent**: Prove the three Risk #3 cases at the cheapest layer that actually sees `user`.

**Contract**: Colocated tests (new `describe` is fine): (1) `("/", null)` → true; (2) `("/auth/signin", null)` → false; (3) `("/", { id: "user-1" })` → false. Do not add `/join` or cookie cases. Do not import middleware.

### Success Criteria:

#### Automated Verification:

- `shouldRedirectUnauthenticated` is exported from `src/lib/protected-routes.ts` and used by `src/middleware.ts` for the unauthenticated redirect.
- `src/lib/protected-routes.test.ts` asserts the three session cases above.
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Middleware still uses the helper for the redirect (no leftover inline `isProtectedPath && !user` gate).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Cookbook §6.1 and §6.3

### Overview

Record how this project adds a matching unit test and a session-level test, so later `/10x-tdd` and rollout phases copy the cheap layer.

- **Behavior asserted:** §6.1 and §6.3 are concrete recipes (location, naming, reference test, run command), not `TBD`.
- **Regression caught:** Future tests landing as Playwright page tours for `/`, or as API tests that mock `listMatches` for ranking.
- **Research source:** test-plan §6 placeholders; this change’s Phases 1–2.
- **Edge/boundary:** §6.3 must say when *not* to use Playwright (cookie/runtime gaps after this helper still green — later lesson). Do not fill §6.2, §6.4, §6.5.
- **Anti-pattern avoided:** Rewriting frozen strategy §1–§5; file:line dumps in the cookbook; endorsing a new runner.

### Changes Required:

#### 1. Unit-test cookbook

**File**: `context/foundation/test-plan.md` (§6.1)

**Intent**: Tell a later agent how to extend matching coverage the way Phase 1 did.

**Contract**: Replace the §6.1 TBD with: colocated `src/lib/services/matching.test.ts`; independent pantry/recipe name fixtures; `npm test`; reference the omelette/cake case plus the two Phase 1 cases; live Check/qty is product law (do not assert quantities ignored); never use mocked `listMatches` as the ranking oracle.

#### 2. Session-level cookbook

**File**: `context/foundation/test-plan.md` (§6.3)

**Intent**: Name the session-level pattern as Jest on the extracted helper, not a browser tour.

**Contract**: Replace the §6.3 TBD with: colocated `src/lib/protected-routes.test.ts`; prove guest `/` redirect, `/auth/signin` not looped, signed-in `/` allowed; run `npm test` (already in CI); **When NOT to use** Playwright / a page tour — this helper is enough unless a later risk is real cookies or the Workers runtime. Optional one-line note under §6.6 that Phase 1 shipped these two patterns. Do not edit §1–§5. Bump the header “Last updated” date.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.1 and §6.3 no longer contain `TBD — see §3 Phase 1`.
- `npm test` still passes: `npm test`

#### Manual Verification:

- A reader of §6.1 / §6.3 can name the file, the cheapest layer, and the anti-pattern for matching vs `/` gating without opening this plan.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `matchRecipes`: full vs partial vs zero-overlap order; recipe-original `"Eggs"` spelling. Existing Check/qty and omelette/cake stay.
- `shouldRedirectUnauthenticated`: three session cases. Existing `isProtectedPath` cases stay.

### Integration Tests:

- None in this change (rollout Phase 2).

### Manual Testing Steps:

1. Confirm the two new matching fixtures are independent (names and expected order/spelling written by hand).
2. Confirm middleware calls the helper for the unauthenticated redirect.
3. Skim cookbook §6.1 and §6.3 for location, command, and “when not Playwright.”

## Performance Considerations

None. Fixtures are tiny in-memory lists; the helper is a boolean.

## Migration Notes

None.

## References

- Related research: `context/changes/testing-critical-path-coverage/research.md`
- Quality contract: `context/foundation/test-plan.md` §2 Risks #1 and #3, §3 Phase 1, §6.1 / §6.3
- Similar extraction: `context/archive/2026-09-04-change-homepage/plan.md` (exact `/` vs prefix; no middleware tests)
- Scorer: `src/lib/services/matching.ts:110-155`
- Existing matching suite: `src/lib/services/matching.test.ts`
- Gate: `src/middleware.ts:41-43`, `src/lib/protected-routes.ts:10-16`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Matching oracle gaps

#### Automated

- [x] 1.1 `src/lib/services/matching.test.ts` contains both new cases (full/partial/zero-overlap order; recipe `"Eggs"` spelling)
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 The two new cases use independent pantry/recipe name fixtures (readable expected order/spelling, not copied scorer internals)

### Phase 2: Session gate helper

#### Automated

- [ ] 2.1 `shouldRedirectUnauthenticated` is exported from `src/lib/protected-routes.ts` and used by `src/middleware.ts` for the unauthenticated redirect
- [ ] 2.2 `src/lib/protected-routes.test.ts` asserts the three session cases above
- [ ] 2.3 Unit tests pass: `npm test`
- [ ] 2.4 Linting passes: `npm run lint`

#### Manual

- [ ] 2.5 Middleware still uses the helper for the redirect (no leftover inline `isProtectedPath && !user` gate)

### Phase 3: Cookbook §6.1 and §6.3

#### Automated

- [ ] 3.1 `context/foundation/test-plan.md` §6.1 and §6.3 no longer contain `TBD — see §3 Phase 1`
- [ ] 3.2 `npm test` still passes: `npm test`

#### Manual

- [ ] 3.3 A reader of §6.1 / §6.3 can name the file, the cheapest layer, and the anti-pattern for matching vs `/` gating without opening this plan
