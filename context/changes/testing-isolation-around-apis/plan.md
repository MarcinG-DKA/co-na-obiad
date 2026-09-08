# Isolation around APIs Implementation Plan

## Overview

Close test-plan rollout Phase 2: prove a member of household A cannot read household B’s pantry, recipes, or match inputs; prove PATCH/DELETE with B’s resource id is 404 and create ignores a client `household_id`; prove the next `listMatches` after a pantry or recipe write shows new scores/missing names. Layer is node Vitest with a shared filter-honoring fake — not Playwright, not live RLS.

## Current State Analysis

Isolation is two layers. App code sets `locals.householdId` from `resolveHouseholdId` (cookie counts only if it is a membership) and every pantry/recipe/matches path filters or inserts with that id. Postgres RLS `is_household_member` plus `save_recipe` membership is the second layer. Vitest never runs the second layer. Existing API tests inject `locals` as `hh-1` and mock services. Existing service tests spy `.eq("household_id", "hh-1")` on builders that ignore filters. There is no `household.test.ts`. Happy-path-only as household A is the current default.

IDOR is the abuse form of that write path. There is no `PUT`. Foreign id is `PantryNotFoundError` / `RecipeNotFoundError` → HTTP 404, never 403. Create schemas have no `household_id`; Zod strips extras; insert/RPC uses locals. API 404 tests reject a mocked service with `NotFoundError` — a foreign uuid and a random missing uuid are indistinguishable.

Ranking is not stored. `listMatches` re-reads pantry + recipes and calls `matchRecipes`. Topbar Home SSR remounts `MatchList` with a fresh `listMatches`. Island `pageshow`/`visibilitychange` is bfcache/tab only. `matches-api.test.ts` mocks `listMatches` and treats HTTP 200 as success — the false proof the test plan said to challenge. Phase 1 already owns matching math oracles; this change must not re-copy the scorer.

`matching.test.ts` hoists `vi.mock` of pantry/recipe loaders. `pantry-api.test.ts` hoists `vi.mock` of the pantry service. Store-backed `listMatches` and an unmocked PATCH cannot be added as describes in those files.

## Desired End State

`npm test` fails if a non-member cookie for B is accepted, if A’s list/get/match load returns B’s rows or titles, if PATCH/DELETE of B’s id as A succeeds or removes B’s row, if POST create honors a body `household_id`, or if `listMatches` is unchanged after a pantry or recipe write on the same store. Cookbook §6.2 and §6.4 name the fake, the 404-not-403 rule, and list-after-write as `listMatches` — not a kitchen Playwright flow.

**Verification:** `npm test` and `npm run lint` pass; the cases below exist; §6.2 and §6.4 are no longer placeholders.

### Key Discoveries:

- `resolveHouseholdId` (`src/lib/services/household.ts:27-42`) is the untested control for current household. API tests bypass middleware, so they never see it.
- Join (`POST /api/households/join`) is supposed to grant B. Isolation is **non-member of B**, not “any second household.”
- Services filter with `.eq("id", …).eq("household_id", …)`; zero rows → 404. `save_recipe` miss message is `"Recipe not found"` (`20260902165500_constrain_units.sql:94-96`).
- `listMatches` (`src/lib/services/matching.ts:157-162`) is `Promise.all` of two household-scoped reads then live `matchRecipes`. Parallel `from()` calls need a per-query fake, not a singleton builder.
- Hot-spot `src/pages/api` is the JSON door; household choice lives in `household.ts`. Hot-spot `src/components` is only the secondary #5 path.

## What We're NOT Doing

- Playwright, browser e2e, `MatchList` pageshow/visibility tests, or Astro page tests (`index.astro`).
- Live RLS, pgTAP, two-JWT Supabase, or a test named “RLS” that only spies `.eq`.
- Importing `src/middleware.ts` (`astro:middleware` / `astro:env`). Middleware catch-path (cookie trusted when `listMemberships` throws) stays an open residual.
- Extra 401 clones on PATCH/DELETE as IDOR proofs.
- Expecting HTTP 403, a `PUT` handler, or `cache: "no-store"` on `GET /api/matches`.
- Mocking `listMatches` (or asserting refetch HTTP 200) as US-02.
- Replacing existing call-shape spies in `pantry.test.ts` / `recipe.test.ts`; they stay.
- Re-mocking `matchRecipes` as a tautology; asserting archived “quantities ignored.”
- Recipe POST extra-`household_id` clone (pantry POST covers handler locals).
- Freshness / Risk #6; rewriting test-plan §1–§5.
- Cloudflare Workers Vitest pool; AI-native / vision layer (none this rollout — checked: 2026-09-08).

## Implementation Approach

Cost × signal, risk order: lock current-household selection (pure unit, no fake), then one shared in-memory store that honors `eq` and prove A cannot read B, then mutate IDOR (service families + one unmocked pantry PATCH for `params.id` wiring) plus create-ignores-household-id, then write-then-`listMatches` for pantry and recipe, then fill cookbook §6.2 / §6.4 from what shipped.

Split by control, not by resource: #2 owns resolver + reads (including `getRecipe` and `listMatches` titles); #4 owns foreign-id mutate + create strip; #5 owns same-household write then list. One store, no duplicated mutates under both #2 and #4.

## Critical Implementation Details

### Hoisted mocks force new files

`src/lib/services/matching.test.ts` mocks `listPantryItems` / `listRecipesWithIngredients`. `src/pages/api/pantry/pantry-api.test.ts` mocks pantry service functions. Store-backed `listMatches` and the unmocked PATCH IDOR case must be **new** colocated files. Do not try to `unmock` inside those suites.

### Fake is a filter store, not PostgREST

Each `from()` starts a new query with its own accumulated filters — `listMatches` runs two chains in parallel. Sequential `eq` is AND intersection on in-memory rows. `.single()` with zero matches returns `{ data: null, error: { code: "PGRST116", message: "…" } }`. `delete({ count: "exact" })` resolves `{ error: null, count: <deleted> }` after filters (0 → service `NotFound`). Nested `recipe_ingredients` come from stored recipe records; do not parse embed SQL. `rpc("save_recipe")` on id+household miss returns `{ data: null, error: { message: "Recipe not found" } }`; on hit, upsert title/steps/ingredients and return the id so `getRecipe` can reload. Do **not** implement `is_household_member`.

### IDOR status is 404 only

Handlers map `PantryNotFoundError` / `RecipeNotFoundError` to `"Item not found"` / `"Recipe not found"` at 404. Do not write a test that expects 403.

### Create strip stays on the mocked handler

`POST /api/pantry` with extra `household_id` is a handler-args prove. Keep it in `pantry-api.test.ts` (service remains mocked). The IDOR PATCH file must **not** mock `updatePantryItem`.

---

## Phase 1: Current-household resolver

### Overview

Cheapest #2 control: cookie B is not current household unless the user is a member of B. No fake, no API, no middleware import.

- **Behavior asserted:** Empty memberships → `null`. Cookie for B with memberships only A → A (earliest A). Cookie for B with memberships A and B → B (join is allowed). Missing/unknown cookie → earliest `created_at` membership.
- **Regression caught:** Treating the cookie as source of truth without a membership check; treating “two households” as a leak after join.
- **Research source:** `context/changes/testing-isolation-around-apis/research.md` Risk #2 (`household.ts:27-42`); join grants B (`join.ts:28-35`).
- **Edge/boundary:** Non-member spoof vs member who joined. `created_at` tie-break is string compare on ISO timestamps (two memberships, no cookie).
- **Anti-pattern avoided:** Happy-path-only as household A; 401 missing session as ownership; importing middleware; testing `listMemberships` / catch-path.

### Changes Required:

#### 1. Colocated resolver suite

**File**: `src/lib/services/household.test.ts`

**Intent**: Lock `resolveHouseholdId` so a spoofed `current_household_id` for B cannot become current household.

**Contract**: New colocated Vitest file. Cases: (1) `[]` → `null`; (2) cookie `"hh-B"` + memberships only `"hh-A"` → `"hh-A"`; (3) cookie `"hh-B"` + memberships `"hh-A"` and `"hh-B"` → `"hh-B"`; (4) `cookieValue` undefined + two memberships → the earlier `created_at`. Do not call `listMemberships`. Do not import middleware.

### Success Criteria:

#### Automated Verification:

- `src/lib/services/household.test.ts` asserts empty memberships → `null`; cookie B with only A → A; cookie B with A and B → B; missing cookie → earliest `created_at`
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- The four cases distinguish non-member spoof of B from join (membership includes B)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Fake store and read isolation

### Overview

Add one small shared fake and prove A cannot read B’s pantry, recipes, or match titles. This is the #2 read prove. Mutates wait for Phase 3.

- **Behavior asserted:** `listPantryItems(A)` omits B’s items; `listRecipes(A)` omits B’s recipes; `getRecipe(A, B’s id)` throws `RecipeNotFoundError`; `listMatches(A)` with B’s pantry and recipes in the same store does not include B’s recipe titles.
- **Regression caught:** Dropping `.eq("household_id")` on list/get while spies still pass; `listMatches` scoring B’s recipes because loaders were mocked with A-only data.
- **Research source:** `research.md` Risk #2 cheapest layer (in-memory store that honors `eq`); `pantry.ts:23-35`, `recipe.ts:131-180`, `matching.ts:157-162`.
- **Edge/boundary:** Seed **both** households in one store. Isolation is non-member of B, not “empty B.” `listMatches` isolation is titles/ids absent — not a new ranking oracle.
- **Anti-pattern avoided:** Happy-path-only as A; “RLS enabled” as isolation; testing the fake’s internals instead of A-cannot-see-B; adding these cases under hoisted-mock files; cloning every read as IDOR.

### Changes Required:

#### 1. Shared filter-honoring fake

**File**: `src/test/supabase-fake.ts`

**Intent**: Give service (and later unmocked-handler) tests a client whose filters actually hide the other household’s rows.

**Contract**: Export a factory that seeds in-memory `pantry_items` and `recipes` (with ingredients) and returns a `SupabaseClient`-shaped object. Required surface: `from` + thenable chain (`select` / `insert` / `update` / `delete({ count: "exact" })` / `eq` / `order` including `{ referencedTable }` / `single`) and `rpc("save_recipe", …)` as specified in Critical Implementation Details. Import via `@/test/supabase-fake`. Do not add `src/test/supabase-fake.test.ts`.

#### 2. Pantry and recipe list/get as A vs B

**File**: `src/lib/services/pantry.test.ts`, `src/lib/services/recipe.test.ts`

**Intent**: Prove household-scoped reads against the fake without throwing away existing call-shape spies.

**Contract**: Add store-backed cases (new `describe` is fine). Seed item/recipe owned by `hh-B` plus at least one owned by `hh-A`. `listPantryItems(client, "hh-A")` returns only A’s items. `listRecipes(client, "hh-A")` returns only A’s recipes. `getRecipe(client, bRecipeId, "hh-A")` rejects with `RecipeNotFoundError`. Keep existing spy tests.

#### 3. `listMatches(A)` does not see B

**File**: `src/lib/services/matching-store.test.ts`

**Intent**: Prove match inputs are household-scoped. Distinct from Phase 4 same-household re-rank. Cannot live in `matching.test.ts` (loaders are mocked there).

**Contract**: No `vi.mock` of pantry/recipe services. Seed B’s pantry and a B recipe whose title cannot appear for A (A may have its own recipe). `listMatches(client, "hh-A")` recipe ids/titles do not include B’s. Use real `listMatches` → real loaders → live `matchRecipes`.

### Success Criteria:

#### Automated Verification:

- `src/test/supabase-fake.ts` exists and is used by the new store-backed cases
- `listPantryItems(A)` omits B’s items; `listRecipes(A)` omits B’s recipes; `getRecipe(A, B’s id)` throws `RecipeNotFoundError`
- `src/lib/services/matching-store.test.ts` asserts `listMatches(A)` with B seeded does not include B’s recipe titles
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- No new test is named or commented as “RLS”; isolation is A-cannot-see-B on the fake, not “RLS enabled”

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: IDOR mutate and create strip

### Overview

Prove authenticated A cannot mutate B’s pantry/recipe by client-chosen id, and cannot choose household on create. One unmocked pantry PATCH proves `params.id` reaches the filter.

- **Behavior asserted:** `updatePantryItem` / `removePantryItem` with B’s item id and household A throw `PantryNotFoundError` and B’s row remains. `saveRecipe` (B’s recipe id) / `removeRecipe` as A throw `RecipeNotFoundError` and B’s recipe remains. `PATCH /api/pantry/:id` with B’s id, locals A, unmocked service → 404 `"Item not found"`, B’s row remains. `POST /api/pantry` `{ name, household_id: "hh-B" }` with locals A calls `addPantryItem` with household `"hh-A"` (or `"hh-1"`) and payload without `household_id`.
- **Regression caught:** Dropping `.eq("household_id")` on update/delete; `save_recipe` RPC that updates by id only; handler passing body household id into insert; API 404 that never runs the service.
- **Research source:** `research.md` Risk #4 (no PUT; 404 only; do not mock the service for foreign-id; one pantry PATCH API wiring; create extra-key POST).
- **Edge/boundary:** Foreign id vs random missing id — the B row must still be present after the call. Authenticated locals (not 401). Create body includes `household_id` and a valid `name`.
- **Anti-pattern avoided:** 401 unauthenticated as IDOR; mocking `updatePantryItem` so the handler never sees a foreign id; expecting 403; cloning every mutate under Risk #2; unmocking every recipe API.

### Changes Required:

#### 1. Pantry mutate against the fake

**File**: `src/lib/services/pantry.test.ts`

**Intent**: Foreign pantry id as A is not found and does not delete/update B’s row.

**Contract**: Seed `id=b-item`, `household_id=hh-B`. `updatePantryItem(client, "b-item", "hh-A", { name: "Stolen" })` rejects `PantryNotFoundError`; `listPantryItems(client, "hh-B")` still contains `b-item` with original name. `removePantryItem(client, "b-item", "hh-A")` same NotFound + row remains.

#### 2. Recipe mutate against the fake RPC/table

**File**: `src/lib/services/recipe.test.ts`

**Intent**: Foreign recipe id as A is not found (RPC id+household miss and delete count 0) and B’s recipe remains.

**Contract**: Seed recipe `b-recipe` on `hh-B`. `saveRecipe(client, "hh-A", validInput, "b-recipe")` rejects `RecipeNotFoundError`. `removeRecipe(client, "b-recipe", "hh-A")` rejects `RecipeNotFoundError`. Reload as `hh-B` still finds the recipe. Fake RPC must use the `"Recipe not found"` message on miss (service matches substring).

#### 3. Unmocked pantry PATCH wiring

**File**: `src/pages/api/pantry/pantry-idor-api.test.ts`

**Intent**: Prove `context.params.id` reaches the real `updatePantryItem` filter. Cannot live in `pantry-api.test.ts`.

**Contract**: `vi.mock("@/lib/supabase")` only; `createClient` returns the shared fake. Do **not** mock `@/lib/services/pantry`. Authenticated locals `householdId: "hh-A"`, `params.id` = B’s item, PATCH body `{ name: "Stolen" }`. Status 404, body `{ error: "Item not found" }`. Fake still holds B’s item. Existing `pantry-api.test.ts` 404-with-mocked-service stays (envelope).

#### 4. Create ignores client household id

**File**: `src/pages/api/pantry/pantry-api.test.ts`

**Intent**: Zod strip + handler locals, not a store-backed insert.

**Contract**: One POST `{ name: "Milk", household_id: "hh-B" }` with default locals `hh-1`. Expect `addPantryItem` called with household `"hh-1"` and input `{ name: "Milk" }` (no `household_id` in the third argument). Keep the existing happy POST.

### Success Criteria:

#### Automated Verification:

- Store-backed `updatePantryItem` and `removePantryItem` with B’s id as A throw `PantryNotFoundError` and B’s row remains
- Store-backed `saveRecipe` (B’s id) and `removeRecipe` as A throw `RecipeNotFoundError` and B’s recipe remains
- `src/pages/api/pantry/pantry-idor-api.test.ts` PATCH of B’s id as A returns 404 `"Item not found"` without mocking `updatePantryItem`, and B’s row remains
- `POST /api/pantry` with extra `household_id` still calls `addPantryItem` with the locals household and `{ name: "Milk" }`
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- No new test expects 403 or a PUT route; 401 is not used as the IDOR oracle

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: List-after-write re-rank

### Overview

Prove ranking is recomputed on the next `listMatches` after a real pantry write and after a real recipe write on the same fake. Primary US-02 path is this data plane (SSR Home calls `listMatches`). No e2e.

- **Behavior asserted:** After `addPantryItem` for household A, a second `listMatches(A)` shows a changed score and/or missing names versus the pre-write list. After `saveRecipe` for household A, a second `listMatches(A)` shows a changed score and/or missing names.
- **Regression caught:** Caching match results inside `listMatches`; loaders that snapshot pantry/recipes at module init; treating mocked `GET /api/matches` HTTP 200 as US-02.
- **Research source:** `research.md` Risk #5 (`matching.ts:157-162`; writes never call matching; cheapest prove is service `listMatches` after changing pantry and one recipe).
- **Edge/boundary:** Same household, mutable fake, **two** `listMatches` calls in one test (before/after). Name-only or live Check/qty fixtures are both valid; expected **delta** is written from the product law (Phase 1), not pasted `classifyNeed`. Distinct from Phase 2 (B’s titles absent).
- **Anti-pattern avoided:** Kitchen-flow e2e; first-paint SSR as the only prove; refetch HTTP 200 with mocked `listMatches`; a new copy of the scorer; asserting archived “quantities ignored.”

### Changes Required:

#### 1. Pantry write then `listMatches`

**File**: `src/lib/services/matching-store.test.ts`

**Intent**: A pantry add that should change coverage is visible on the next ranked-list load.

**Contract**: Seed household A with a recipe whose missing names include an ingredient not yet in the pantry. Capture `listMatches` once. `addPantryItem` that ingredient. `listMatches` again. Assert the recipe’s `score` increased and/or that ingredient left `missingNames`. Independent hand-built names.

#### 2. Recipe write then `listMatches`

**File**: `src/lib/services/matching-store.test.ts`

**Intent**: A recipe save that should change coverage is visible on the next ranked-list load.

**Contract**: Seed household A pantry + a recipe. Capture `listMatches`. `saveRecipe` that changes ingredients (e.g. drop a missing name, or add one). `listMatches` again. Assert score and/or `missingNames` changed. Use the fake RPC so `saveRecipe` actually updates the store `getRecipe` / list loaders read.

### Success Criteria:

#### Automated Verification:

- `matching-store.test.ts` asserts `listMatches` scores/missing names change after `addPantryItem`
- `matching-store.test.ts` asserts `listMatches` scores/missing names change after `saveRecipe`
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Before/after expected values are independent fixtures (readable names and a stated delta), not copied scorer internals; `matching.test.ts` loader-mock wiring tests remain for parallel-load/errors only

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 5: Cookbook §6.2 and §6.4

### Overview

Record how this project adds an isolation/IDOR/list-after-write integration test and a `{ data, error }` JSON route test, so later `/10x-tdd` copies the cheap layer.

- **Behavior asserted:** §6.2 and §6.4 are concrete recipes (location, fake, 404-not-403, list-after-write = `listMatches`, run command), not `TBD`.
- **Regression caught:** Future isolation tests that stay happy-path as A; IDOR tests that mock the service; US-02 tests that mock `listMatches` or open Playwright.
- **Research source:** test-plan §6 placeholders; this change’s Phases 1–4.
- **Edge/boundary:** Fill only §6.2 and §6.4 (and a §6.6 Phase 2 line). Leave §6.5 for rollout Phase 3. Do not edit §1–§5.
- **Anti-pattern avoided:** File:line dumps in the cookbook; endorsing e2e or live RLS as the Phase 2 pattern; rewriting frozen strategy.

### Changes Required:

#### 1. Integration-test cookbook

**File**: `context/foundation/test-plan.md` (§6.2)

**Intent**: Tell a later agent how to prove two-household isolation, IDOR, and re-rank the way this change did.

**Contract**: Replace the §6.2 TBD with: shared fake at `src/test/supabase-fake.ts` (honors `eq`; not RLS); `resolveHouseholdId` colocated tests (cookie must be a membership; join is allowed); store-backed service reads/mutates; `matching-store.test.ts` for A-cannot-see-B titles and write-then-`listMatches`; unmocked pantry PATCH in `pantry-idor-api.test.ts`; foreign id is **404**, B’s row remains; no PUT; do not mock the service for foreign-id; do not use Playwright for US-02. **Run locally:** `npm test`.

#### 2. New JSON API cookbook

**File**: `context/foundation/test-plan.md` (§6.4)

**Intent**: Tell a later agent how to test `{ data, error }` routes without treating 401 or mocked services as ownership.

**Contract**: Replace the §6.4 TBD with: colocated `*-api.test.ts`; `vi.mock("@/lib/supabase")` so `astro:env` never loads; inject `locals.user` / `locals.householdId` (middleware bypassed); Zod body; household from locals never body (extra-key POST); envelope 401/400/404 stays mocked-service; **ownership/IDOR** uses the fake and does not mock the service; never trust a client household id. Optional §6.6 one-liner that Phase 2 shipped these patterns. Bump header “Last updated”. Do not edit §1–§5.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.2 and §6.4 no longer contain `TBD — see §3 Phase 2`
- `npm test` still passes: `npm test`

#### Manual Verification:

- A reader of §6.2 / §6.4 can name the fake, 404-not-403, “cookie must be a membership,” and list-after-write as `listMatches` (not Playwright) without opening this plan

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `resolveHouseholdId`: empty / spoof B / join B / earliest membership. Pure function.

### Integration Tests:

- Shared fake + pantry/recipe list/get isolation; `listMatches(A)` with B seeded.
- Store-backed pantry PATCH/DELETE and recipe save/delete foreign id (404 + row remains).
- Unmocked `PATCH /api/pantry/:id` foreign id.
- POST extra `household_id` (handler args).
- `addPantryItem` then `listMatches`; `saveRecipe` then `listMatches`.

### Manual Testing Steps:

1. Confirm resolver cases are spoof vs join, not two copies of household A.
2. Confirm the IDOR PATCH file does not mock `updatePantryItem`.
3. Confirm list-after-write fixtures state a before/after delta in names, not a pasted formula.
4. Skim cookbook §6.2 / §6.4 for fake location, 404, and “when not Playwright.”

## Performance Considerations

None. Fixtures are tiny in-memory rows.

## Migration Notes

None. No production behavior change intended. If a test fails on current code, that is a real isolation/IDOR/re-rank bug — fix it in the same change rather than weakening the assertion.

## References

- Related research: `context/changes/testing-isolation-around-apis/research.md`
- Quality contract: `context/foundation/test-plan.md` §2 Risks #2, #4, #5; §3 Phase 2; §6.2 / §6.4
- Sibling rollout plan: `context/changes/testing-critical-path-coverage/plan.md`
- Lessons: colocated `*.test.ts`; mock `@/lib/supabase` in API tests; Vitest node, not Jest; do not import middleware
- Resolver: `src/lib/services/household.ts:27-42`
- Pantry mutate: `src/lib/services/pantry.ts:77-118`; `src/pages/api/pantry/[id].ts:19-47`
- Recipe mutate: `src/lib/services/recipe.ts:182-229`
- Recompute: `src/lib/services/matching.ts:157-162`
- Create schemas: `src/lib/pantry-schemas.ts`, `src/lib/recipe-schemas.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Current-household resolver

#### Automated

- [x] 1.1 `src/lib/services/household.test.ts` asserts empty memberships → `null`; cookie B with only A → A; cookie B with A and B → B; missing cookie → earliest `created_at`
- [x] 1.2 Unit tests pass: `npm test`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 The four cases distinguish non-member spoof of B from join (membership includes B)

### Phase 2: Fake store and read isolation

#### Automated

- [ ] 2.1 `src/test/supabase-fake.ts` exists and is used by the new store-backed cases
- [ ] 2.2 `listPantryItems(A)` omits B’s items; `listRecipes(A)` omits B’s recipes; `getRecipe(A, B’s id)` throws `RecipeNotFoundError`
- [ ] 2.3 `src/lib/services/matching-store.test.ts` asserts `listMatches(A)` with B seeded does not include B’s recipe titles
- [ ] 2.4 Unit tests pass: `npm test`
- [ ] 2.5 Linting passes: `npm run lint`

#### Manual

- [ ] 2.6 No new test is named or commented as “RLS”; isolation is A-cannot-see-B on the fake, not “RLS enabled”

### Phase 3: IDOR mutate and create strip

#### Automated

- [ ] 3.1 Store-backed `updatePantryItem` and `removePantryItem` with B’s id as A throw `PantryNotFoundError` and B’s row remains
- [ ] 3.2 Store-backed `saveRecipe` (B’s id) and `removeRecipe` as A throw `RecipeNotFoundError` and B’s recipe remains
- [ ] 3.3 `src/pages/api/pantry/pantry-idor-api.test.ts` PATCH of B’s id as A returns 404 `"Item not found"` without mocking `updatePantryItem`, and B’s row remains
- [ ] 3.4 `POST /api/pantry` with extra `household_id` still calls `addPantryItem` with the locals household and `{ name: "Milk" }`
- [ ] 3.5 Unit tests pass: `npm test`
- [ ] 3.6 Linting passes: `npm run lint`

#### Manual

- [ ] 3.7 No new test expects 403 or a PUT route; 401 is not used as the IDOR oracle

### Phase 4: List-after-write re-rank

#### Automated

- [ ] 4.1 `matching-store.test.ts` asserts `listMatches` scores/missing names change after `addPantryItem`
- [ ] 4.2 `matching-store.test.ts` asserts `listMatches` scores/missing names change after `saveRecipe`
- [ ] 4.3 Unit tests pass: `npm test`
- [ ] 4.4 Linting passes: `npm run lint`

#### Manual

- [ ] 4.5 Before/after expected values are independent fixtures (readable names and a stated delta), not copied scorer internals; `matching.test.ts` loader-mock wiring tests remain for parallel-load/errors only

### Phase 5: Cookbook §6.2 and §6.4

#### Automated

- [ ] 5.1 `context/foundation/test-plan.md` §6.2 and §6.4 no longer contain `TBD — see §3 Phase 2`
- [ ] 5.2 `npm test` still passes: `npm test`

#### Manual

- [ ] 5.3 A reader of §6.2 / §6.4 can name the fake, 404-not-403, “cookie must be a membership,” and list-after-write as `listMatches` (not Playwright) without opening this plan
