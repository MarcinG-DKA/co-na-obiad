---
date: 2026-09-08T14:12:00+02:00
researcher: Marcin
git_commit: 37d6d36b39372bcb14e57946cc49fd262f589281
branch: 10x-test-plan
repository: co-na-obiad
topic: "Ground rollout Phase 2 — household isolation (Risk #2), IDOR (Risk #4), list-after-write re-rank (Risk #5)"
tags: [research, codebase, isolation, idor, matching, pantry, recipes, test-plan, vitest]
status: complete
last_updated: 2026-09-08
last_updated_by: Marcin
last_updated_note: "Added follow-up research for parallel-pass deltas (401 coverage on mutate, GET cache, live-RLS vs Phase 2 stack)"
---

# Research: Ground rollout Phase 2 — isolation, IDOR, list-after-write

**Date**: 2026-09-08T14:12:00+02:00
**Researcher**: Marcin
**Git Commit**: [37d6d36b39372bcb14e57946cc49fd262f589281](https://github.com/MarcinG-DKA/co-na-obiad/commit/37d6d36b39372bcb14e57946cc49fd262f589281)
**Branch**: 10x-test-plan
**Repository**: co-na-obiad

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` (“Isolation around APIs”).

Risks to verify: **#2** member of household A sees or changes B’s pantry, recipes, or matches; **#4** logged-in user mutates another household’s pantry/recipe via a client-chosen id or household id; **#5** cook edits pantry or a recipe, returns to `/`, and still sees the old ranking.

Risk response guidance to verify, not blindly accept:

- **#2**: prove member of A cannot read or write B’s pantry, recipes, or matches. Challenge: logged-in ⇒ allowed; “RLS enabled” ⇒ isolated; 401 on missing session ⇒ ownership. Avoid happy-path-only as household A.
- **#4**: prove PUT/PATCH/DELETE with another household’s resource id is 403/404; create ignores a client-supplied household id. Challenge: 401 unauthenticated ⇒ IDOR is covered. Avoid mocking the service so the handler never sees a foreign id.
- **#5**: prove after a pantry/recipe write the next ranked-list load (SSR or on-screen refetch) shows new scores/missing names. Challenge: first-paint SSR ⇒ US-02; refetch HTTP 200 ⇒ ranking changed. Avoid kitchen-flow e2e when list-after-write would catch it.

Hot-spot directories (likelihood evidence, not anchors): `src/pages/api`, `src/components` (scope `src/`).

Stack: Vitest 5.x (node, colocated `src/**/*.test.ts`); API tests mock `@/lib/supabase` so `astro:env` is never loaded; no e2e runner this phase.

## Summary

None of the three risks is a present, demonstrated leak in the happy path. All three are real **regression classes**. The test plan’s prove-columns are directionally right; several details are wrong enough to mis-plan the suite.

**Risk #2.** Isolation is a two-layer design: (1) `Astro.locals.householdId` from memberships + `current_household_id` cookie, then every JSON/SSR read/write `.eq("household_id", householdId)` or `save_recipe(p_household_id := locals)`; (2) Postgres RLS `is_household_member(household_id)` on pantry/recipes, plus a membership check inside the `save_recipe` definer. Vitest never runs (2). Existing API tests inject `locals` for household A and mock the service — they prove 401/400 envelopes, not “A cannot see B.” There is **no** `household.test.ts`. `resolveHouseholdId` is the cheapest untested control for “current household.” Join is supposed to **grant** B, not isolate from B. Middleware’s `listMemberships` catch trusts the cookie without a membership check; production RLS is the backstop if `SUPABASE_KEY` is the anon key bound to the user JWT.

**Risk #4.** There is **no PUT**. Mutate is `PATCH`/`DELETE` (and recipe `POST` create). Foreign resource id is **404** (`PantryNotFoundError` / `RecipeNotFoundError`), never 403. Create schemas have no `household_id`; Zod strips extras; insert/RPC uses `locals.householdId`. Existing API tests **do** mock the service, so the handler never sees a foreign id — the listed anti-pattern is already the suite’s default. Cheapest IDOR proof: run the real service against a fake store that actually filters on `id` **and** `household_id` (or an API test that does not mock the service). Spying that `.eq("household_id", "hh-1")` was called is not two-household isolation.

**Risk #5.** Ranking is **not stored**. `listMatches` always re-reads pantry + recipes and calls `matchRecipes`. Full navigation to `/` (Topbar Home) SSR-calls `listMatches` and remounts `MatchList` with new `initialMatches`. The island refetch (`GET /api/matches` on `pageshow` when `event.persisted`, and `visibilitychange` → visible) is the bfcache/tab-return path, not the primary MPA return. `src/components` as the hot-spot is **misleading** for the main US-02 path. Existing `matches-api.test.ts` mocks `listMatches` and treats HTTP 200 as success — that is exactly the false proof the plan said to challenge. Cheapest layer: **service** `listMatches` against a mutable pantry/recipe fake (scores/missing names change after a write). Do **not** add Playwright this phase. Kitchen-flow e2e is the right anti-pattern to keep.

Hot-spot `src/pages/api` is the HTTP surface for #2/#4, not where household is chosen and not where ranking is computed. Hot-spot `src/components` is only the secondary freshness path for #5.

## Detailed Findings

### Risk #2 — household isolation (read and write)

#### Failure path

| Step | Where |
|------|--------|
| Session user | [`src/middleware.ts:15-22`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L15-L22) `getUser` → `locals.user` |
| Current household | [`src/middleware.ts:24-38`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L24-L38) `listMemberships` + cookie → `resolveHouseholdId` → `locals.householdId` |
| Cookie repair | [`src/middleware.ts:33-35`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L33-L35) rewrite cookie when resolved id ≠ incoming |
| Catch (unverified cookie) | [`src/middleware.ts:36-37`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L36-L37) if `listMemberships` throws, `householdId = cookie` with **no** membership check |
| Page gate | [`src/middleware.ts:41-43`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L41-L43) unauthenticated **pages** redirect. `/api/*` is **not** `isProtectedPath` ([`protected-routes.ts:10-19`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/protected-routes.ts#L10-L19); test asserts `/api/matches` is unprotected). APIs self-check `locals.user`. |
| Handler household | Every pantry/recipe/matches/freshness handler: `context.locals.householdId` or 400 `"No household"`. Never body/query. |
| App filter | Services `.eq("household_id", householdId)` on list/get/update/delete; create `insert({ household_id: householdId })`; recipes save `rpc("save_recipe", { p_household_id: householdId, ... })`. |
| Matches | [`listMatches`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/matching.ts#L157-L162) loads pantry + recipes for that id, then scores in memory. **No matches table, no write API.** |
| RLS (prod only) | `pantry_items` / `recipes` / `recipe_ingredients`: `using (is_household_member(household_id))`. `save_recipe` definer also `is_household_member(p_household_id)` then `update ... where id = p_recipe_id and household_id = p_household_id`. |

A member of **only** A who still receives B’s rows needs one of: `locals.householdId` set to B (cookie accepted without membership, or catch-path), a service query missing `.eq("household_id")`, or RLS + app filter both gone while using a key that bypasses RLS.

#### How current household is chosen

[`resolveHouseholdId`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/household.ts#L27-L42):

- No memberships → `null`.
- Cookie value is used **only if** it appears in `memberships`.
- Otherwise earliest `created_at` membership.

Users **may** belong to many households (F-01). There is **no switcher UI**. The only way to change current household in-app is [`POST /api/households/join`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/households/join.ts#L28-L35): `join_household` RPC then set cookie to the joined id (even if an older membership exists). After a successful join, seeing B’s pantry is **correct**, not a leak.

Spoofing `Cookie: current_household_id=<B>` while memberships are only A: intended control rejects B and uses earliest A. That control is **untested**.

#### API household source (all relevant endpoints)

| Method | Path | Auth | Household source | Resource id | Notes |
|--------|------|------|------------------|-------------|-------|
| GET/POST | `/api/pantry` | 401 if no user | `locals.householdId` | n/a | POST body: name/qty/unit only |
| PATCH/DELETE | `/api/pantry/:id` | 401 | `locals` | `params.id` | 404 if 0 rows for id+household |
| GET | `/api/pantry/freshness` | 401 | `locals` | n/a | read-only timestamp |
| GET/POST | `/api/recipes` | 401 | `locals` | n/a | POST → `save_recipe` |
| GET/PATCH/DELETE | `/api/recipes/:id` | 401 | `locals` | `params.id` | PATCH → `save_recipe` with recipeId |
| GET | `/api/matches` | 401 | `locals` | n/a | read-only ranking |
| POST | `/api/households/join` | redirect to sign-in | RPC + cookie write | invite code | grants membership |

SSR pages (`/`, `/pantry`, `/recipes`, `/recipes/:id`) pass the same `Astro.locals.householdId` into the same services.

Zod: [`addPantryItemSchema`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/pantry-schemas.ts#L4-L8) / [`saveRecipeSchema`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/recipe-schemas.ts#L10-L17) have no `household_id`. Default Zod object **strips** unknown keys.

#### RLS vs app check

- **App (what Vitest can see):** `.eq("household_id")` / insert column / `p_household_id` from locals.
- **RLS (what Vitest cannot see):** [`20260902111000_pantry_items.sql:16-41`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/supabase/migrations/20260902111000_pantry_items.sql#L16-L41), [`20260902151904_recipe_management.sql:31-82`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/supabase/migrations/20260902151904_recipe_management.sql#L31-L82). Archive pantry/recipe plans: isolation proven with **manual SQL + browser**, not pgTAP.
- **Definer RPC:** live `save_recipe` in [`20260902165500_constrain_units.sql:56-58`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/supabase/migrations/20260902165500_constrain_units.sql#L56-L58) rejects non-members; update is `id` **and** `household_id`. A mocked `rpc` in Vitest never executes that.

`createClient` is `createServerClient` with request cookies ([`supabase.ts:10-11`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/supabase.ts#L10-L11)). If `SUPABASE_KEY` is the anon/publishable key, PostgREST runs as `auth.uid()` and RLS applies. If it were the service role, RLS would not apply and app `.eq` would be the only line. This phase cannot assert the key type from gitignored env.

#### Existing tests vs isolation

| Suite | What it actually asserts | Isolation? |
|-------|--------------------------|------------|
| `pantry-api.test.ts` / `recipes-api.test.ts` / `matches-api.test.ts` / `freshness-api.test.ts` | 401 no user **on GET list** (not asserted on PATCH/DELETE, though handlers still 401 first); 400 no household; 500 no supabase; happy GET/POST as **hh-1**; 404 when **mocked** service throws NotFound | No. Services mocked. Locals injected. Always A. |
| `pantry.test.ts` / `recipe.test.ts` | Query builder spies: `.eq("household_id", "hh-1")` was called; insert includes `household_id: "hh-1"`; PGRST116 / count 0 → NotFound | **Call-shape**, not two households. Fake always returns the scripted result even if `.eq` were removed (except the spy would fail). |
| `matching.test.ts` `listMatches` | Mocks pantry/recipe loaders; one hardcoded match for hh-1 | No cross-household. |
| `protected-routes.test.ts` | Path helper / session redirect helper | Auth gate, not ownership. |
| *(missing)* `household.test.ts` | — | **`resolveHouseholdId` untested.** |

Happy-path-only as household A: **confirmed** as the current default.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove: member of A cannot read or write B’s pantry, recipes, or matches | **Keep.** Matches are read-only: prove GET/listMatches for A does not include B’s recipes/pantry in the score inputs. There is nothing to “write” on matches. |
| Challenge: logged-in ⇒ allowed | **Confirmed.** 401 tests are plentiful and do not prove ownership. |
| Challenge: “RLS enabled” ⇒ isolated | **Confirmed.** RLS is real in SQL and untested in Vitest. Do not add a test named “RLS” that only spies `.eq`. |
| Challenge: 401 missing session ⇒ ownership | **Confirmed.** |
| Cheapest layer: API/service integration with two-user fixtures | **Correct the fixture meaning.** This phase has no Postgres. “Two-user” = two household ids in an **in-memory store that honors `eq`**, plus **unit tests for `resolveHouseholdId`** (cookie for B rejected). Do not import middleware (`astro:middleware` / `astro:env`) unless planning reuses the Phase 1 mock pattern; household selection is already a pure function. |
| Anti-pattern: happy-path-only as A | **Keep.** |
| Join path | Isolation is **non-member of B**, not “any second household.” After join, B is allowed. |

Hot-spot `src/pages/api`: **partial**. Handlers are the JSON door; they trust `locals`. The choice of household lives in `household.ts` + middleware. Filters live in `src/lib/services`. Citing only `src/pages/api` as the failure site is misleading.

Risk #2 is **not speculative** as a regression of `.eq` / resolver / join cookie. It **is** speculative as “A currently reads B in the app today” on the membership-checked path.

---

### Risk #4 — IDOR (client-chosen id / household id)

#### Failure path

Authenticated user of A sends `PATCH /api/pantry/<B's item uuid>` (or recipe PATCH/DELETE) with `locals.householdId = A`.

Service: `.eq("id", itemId).eq("household_id", A)`. Zero rows → `PantryNotFoundError` / `RecipeNotFoundError` → handler **404** `"Item not found"` / `"Recipe not found"`. Same for DELETE with `count: "exact"` and `if (!count)`.

Recipe PATCH: `save_recipe` updates `where id = p_recipe_id and household_id = p_household_id`; miss → `'Recipe not found'` → 404. Membership check on `p_household_id` (from locals, not body) rejects a client who is not in that household — **in Postgres**, not in Vitest.

Create: `POST` body cannot set household. [`addPantryItem`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/pantry.ts#L59-L66) inserts `household_id: householdId` from the second argument (locals). Existing POST test already `toHaveBeenCalledWith(..., "hh-1", { name: "Milk" })` but does **not** send `household_id` in the body.

**No `export const PUT`** anywhere under `src/`.

**No 403** in `src/` for these resources.

#### Per-endpoint mutate behavior

| Method | Path | Foreign resource id (authenticated, household A) | Client `household_id` in body |
|--------|------|---------------------------------------------------|-------------------------------|
| POST | `/api/pantry` | n/a | stripped; insert uses locals |
| PATCH | `/api/pantry/:id` | 404 | ignored (update payload is name/qty/unit) |
| DELETE | `/api/pantry/:id` | 404 | n/a |
| POST | `/api/recipes` | n/a | stripped; RPC `p_household_id` = locals |
| PATCH | `/api/recipes/:id` | 404 (`Recipe not found`) | stripped |
| DELETE | `/api/recipes/:id` | 404 | n/a |
| GET | `/api/recipes/:id` | 404 (read IDOR; belongs with #2) | n/a |
| GET | `/api/matches` | n/a (no id) | n/a |

#### Existing tests vs IDOR

[`pantry-api.test.ts:16-25`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/pantry/pantry-api.test.ts#L16-L25) and [`recipes-api.test.ts:10-18`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/recipes/recipes-api.test.ts#L10-L18): `vi.mock` the service module, keep error classes, replace list/add/update/remove/save with `vi.fn()`.

404 tests: `mockUpdate.mockRejectedValue(new PantryNotFoundError())` with `id: "missing"`. The service **does not run**. A foreign uuid and a random missing uuid are indistinguishable. **Anti-pattern confirmed in production tests.**

Service tests: `updatePantryItem` “scopes the update to id and household_id” asserts **both** `.eq` calls. That fails if someone deletes the household filter **and** the spy is kept. It does **not** fail if the fake still returns `sampleItem` for a B row when household is A — the fake ignores filters.

#### Cheapest useful IDOR test

1. **Do not mock** `updatePantryItem` / `removePantryItem` / `getRecipe` / `removeRecipe` / `saveRecipe` for the IDOR cases.
2. Mock `@/lib/supabase` `createClient` to return an **in-memory** table: rows have `id` + `household_id`; `eq` intersects; `.single()` / delete count follow PostgREST (PGRST116 / count 0).
3. Seed item `id=b-item` with `household_id=hh-B`. Call PATCH/DELETE with `locals.householdId=hh-A`, `params.id=b-item`. Expect **404** and the B row still present.
4. Create: POST `{ name: "Milk", household_id: "hh-B" }` with locals `hh-A`; expect service/insert `household_id: "hh-A"` (handler-level mock of `addPantryItem` is enough **for this one prove**, because the question is which arguments the handler passed).

A query-builder spy without a store is cheaper but weaker (Risk #2 overlap). Prefer one shared fake used by service **or** un-mocked-handler tests — not both copies of the same case.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove PUT/PATCH/DELETE foreign id is 403/404 | **Correct to PATCH/DELETE (no PUT). Live status is 404 only.** Keep 403 as acceptable if a future handler adds it; do not write a test that expects 403 today. |
| Prove create ignores client household id | **Keep.** Implemented (schema + locals). Add the extra-key POST; current happy POST does not send `household_id`. |
| Challenge: 401 ⇒ IDOR | **Confirmed.** |
| Avoid mocking the service so the handler never sees a foreign id | **Confirmed as the current gap.** Un-mock service **or** put the two-household store under the service tests and let API keep envelope-only. Cost × signal: **one** store-backed service (or API) case per mutate family, not 12 clones. |
| Cheapest layer: API integration, two households | **Service-level store is cheaper and sufficient** for the filter. Add API-level only if we need to prove `params.id` actually reaches that filter (today `[id].ts` passes `context.params.id` through). One pantry PATCH API test with un-mocked service is enough for that wiring; recipes can stay service-level if `save_recipe` rpc is faked to enforce id+household. |

Risk #4 is **not speculative**. It is the abuse form of #2’s write path. Overlap is real: do not duplicate every read case under both numbers.

---

### Risk #5 — ranked list stale after pantry/recipe write

#### When ranking is computed

[`listMatches`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/matching.ts#L157-L162): `Promise.all(listPantryItems, listRecipesWithIngredients)` then `matchRecipes`. No snapshot table, no cache header on `/`, no View Transitions, no match writes on pantry POST/PATCH/DELETE. `jsonResponse` sets only `Content-Type`; `MatchList` `fetch("/api/matches")` does not pass `cache: "no-store"`. A browser heuristically caching that GET is **speculative** — not a Phase 2 prove, not a reason to add e2e.

Pantry/recipe services **never** call matching. Re-rank is **on next read**.

#### Two load paths (both real)

**A — Full document load (primary US-02/US-04 return).** Topbar [`Home` → `/`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/components/Topbar.astro#L13-L14). [`index.astro:20-24`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/index.astro#L20-L24) always `listMatches(supabase, householdId)` when both exist. [`MatchList`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/index.astro#L83) `client:load` with `initialMatches={matches}`. New page → new island → `useState(initialMatches)` is fresh. PantryManager does **not** refetch matches (by design; archived matching plan).

**B — Island refetch (bfcache / tab).** [`MatchList.tsx:33-76`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/components/matches/MatchList.tsx#L33-L76): `GET /api/matches`; `pageshow` only if `event.persisted`; `visibilitychange` when `visible`. Archived impl-review F1 (`skipFirstVisible`) is **gone**. `PantryFreshness` copies the same events for a **different** endpoint (Risk #6, not this phase).

There is no refetch on island mount. MPA Home click does not need one.

#### Existing tests

- `matching.test.ts`: scorer + `listMatches` wiring with **mocked** loaders. No “pantry rows changed → scores changed” unless loaders return new data in the same test (they do not).
- `matches-api.test.ts`: mocks `listMatches`; `"returns ranked matches for the household"` is HTTP 200 + envelope. **Does not prove ranking changed.**

No component tests. No Playwright.

#### Would “write then listMatches” catch stale UI?

**Data plane yes, island no.** If `listMatches` always recomputes, a service test that mutates an in-memory pantry then lists again **is** the list-after-write oracle. It would **not** catch deleting the `pageshow` listener. That listener is only required for bfcache/tab. Phase 2 has **no e2e runner**; the plan already says e2e only if the island refetch **is** the failure. For Topbar-Home (the cook’s normal return), SSR + `listMatches` is the failure site. Kitchen-flow Playwright would be the anti-pattern.

`index.astro` is not importable in Vitest (`*.test.ts` only; `astro:env`). Do not add an Astro page test this phase.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove: after a pantry/recipe write, next ranked-list load shows new scores/missing names | **Keep**, with “load” = `listMatches` / real `GET /api/matches` (unmocked matching), **not** a browser tour. |
| Challenge: first-paint SSR ⇒ US-02 | **Confirmed as a false proof if we only note that `index.astro` calls `listMatches`.** SSR **does** recompute on every full GET; that is why MPA Home is safe. The challenge still holds: do not skip a write→list assertion just because SSR exists. |
| Challenge: refetch HTTP 200 ⇒ ranking changed | **Confirmed.** Current matches API test is that false proof. |
| Cheapest: service/API integration after a write; e2e only if island is the failure | **Service `listMatches` after changing pantry (and one recipe) fixtures.** Optional: one GET `/api/matches` that does **not** mock `listMatches`, same fake store. **No e2e this phase.** Island refetch is a residual bfcache risk, not Phase 2’s cheapest prove. |
| Anti-pattern: kitchen-flow e2e | **Keep.** |

Hot-spot `src/components`: **misleading for the primary path.** Failure of “Home still shows old ranks” after a full navigation lives in `listMatches` + loaders (`src/lib/services`). `MatchList` owns only path B.

Risk #5 as “matches rows go stale in the database” is **speculative** (they are not stored). Risk #5 as “cook can see yesterday’s scores” is a **real user scenario** (US-02/US-04) whose cheap control is recompute-on-read. Do not drop the row; reframe the layer.

---

### Test infrastructure (Phase 2 constraints)

- Vitest 5, `environment: "node"`, `@/` alias, colocated `src/**/*.test.ts` ([`vitest.config.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/vitest.config.ts)). 13 test files. No Playwright config.
- API convention: `vi.mock("@/lib/supabase")`, real handlers, hand-built `APIContext` with `locals` (middleware bypassed). Partial service mocks use `importOriginal` to keep `*NotFoundError`.
- Lessons: colocated `*.test.ts`; mock supabase so `astro:env` never loads; runner is Vitest not Jest.
- Cannot exercise RLS, `save_recipe` membership, or `join_household` in this runner without a database.
- `index.astro` / `MatchList.tsx` are out of cheap Vitest reach for DOM events.
- Phase 1 already owns matching **math** oracles; Phase 2 must not re-mock `matchRecipes` as a tautology. List-after-write should reuse **independent name fixtures** and assert score/missing **change**, not a new copy of the scorer.

## Code References

- [`src/lib/services/household.ts:27-42`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/household.ts#L27-L42) — `resolveHouseholdId` (cookie must be a membership)
- [`src/lib/services/household.ts:44-54`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/household.ts#L44-L54) — `listMemberships` throws on PostgREST error
- [`src/middleware.ts:24-38`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/middleware.ts#L24-L38) — household cookie + catch-path
- [`src/pages/api/pantry/index.ts:14-16`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/pantry/index.ts#L14-L16) / [`37-60`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/pantry/index.ts#L37-L60) — locals household; POST create
- [`src/pages/api/pantry/[id].ts:19-47`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/pantry/%5Bid%5D.ts#L19-L47) — PATCH `params.id` → 404
- [`src/pages/api/recipes/[id].ts:40-80`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/recipes/%5Bid%5D.ts#L40-L80) — PATCH/DELETE 404
- [`src/pages/api/matches/index.ts:8-25`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/matches/index.ts#L8-L25) — GET matches from locals
- [`src/pages/api/households/join.ts:28-35`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/households/join.ts#L28-L35) — join sets cookie to B
- [`src/lib/services/pantry.ts:77-118`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/pantry.ts#L77-L118) — update/delete scoped to id + household
- [`src/lib/services/recipe.ts:182-229`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/recipe.ts#L182-L229) — RPC household + delete scoped
- [`src/lib/services/matching.ts:157-162`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/services/matching.ts#L157-L162) — recompute on read
- [`src/pages/index.astro:20-24`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/index.astro#L20-L24) / [`83`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/index.astro#L83) — SSR seed
- [`src/components/matches/MatchList.tsx:33-76`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/components/matches/MatchList.tsx#L33-L76) — visibility/pageshow refetch
- [`src/lib/pantry-schemas.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/pantry-schemas.ts) / [`src/lib/recipe-schemas.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/lib/recipe-schemas.ts) — no client household id
- [`supabase/migrations/20260902111000_pantry_items.sql:18-41`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/supabase/migrations/20260902111000_pantry_items.sql#L18-L41) — pantry RLS
- [`supabase/migrations/20260902165500_constrain_units.sql:56-92`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/supabase/migrations/20260902165500_constrain_units.sql#L56-L92) — live `save_recipe` membership + id+household update
- [`src/pages/api/pantry/pantry-api.test.ts:16-25`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/pantry/pantry-api.test.ts#L16-L25) — service mocked
- [`src/pages/api/matches/matches-api.test.ts:10-16`](https://github.com/MarcinG-DKA/co-na-obiad/blob/37d6d36b39372bcb14e57946cc49fd262f589281/src/pages/api/matches/matches-api.test.ts#L10-L16) — `listMatches` mocked

## Architecture Insights

- **Belt and suspenders:** locals + `.eq(household_id)` + RLS (+ definer membership for recipe save). Automated tests today only touch the first inch of the first layer (401 and spies).
- **IDOR is 404 by design** (existence hiding). Planning should not invent 403.
- **Many-to-many membership** means “two households” tests must distinguish *non-member* vs *member who joined*. Cookie spoof as non-member is the isolation case.
- **Ranking is a pure function of two household-scoped reads.** Stale UI is either a missed read (wrong household id — #2) or a client that does not read again (island path B). Writes do not invalidate a cache because there is no cache.
- **API tests bypass middleware.** Ownership tests that only inject `locals.householdId` never see `resolveHouseholdId`. That is why household unit tests are not optional extras.

## Historical Context (from prior changes)

- [`context/archive/2026-09-01-household-data-scaffold/plan.md`](../../archive/2026-09-01-household-data-scaffold/plan.md) — RLS leakage **not proven in F-01**; deferred to S-01; many-to-many; cookie = current household; no switcher; join sets cookie to joined household.
- [`context/archive/2026-09-02-pantry-management/plan.md`](../../archive/2026-09-02-pantry-management/plan.md) — “first real isolation proof”; **manual SQL**, no pgTAP; API household from `locals`, never body; WITH CHECK on INSERT as belt-and-suspenders. Browser checkbox 3.10, not CI.
- [`context/archive/2026-09-02-recipe-management/plan.md`](../../archive/2026-09-02-recipe-management/plan.md) — same: locals not body; RLS for read/delete; `save_recipe` membership; manual SQL isolation.
- [`context/archive/2026-09-03-pantry-recipe-matching/research.md`](../../archive/2026-09-03-pantry-recipe-matching/research.md) — early option: pantry island refetch after add/update/delete. **Planning rejected** in-place pantry refetch; dashboard next-show + visibility/`pageshow` won (`plan.md`).
- [`context/archive/2026-09-03-pantry-recipe-matching/plan.md`](../../archive/2026-09-03-pantry-recipe-matching/plan.md) — re-rank on **next show**, not on `/pantry`; SSR first paint + `pageshow`/`visibilitychange` refetch; no realtime.
- [`context/archive/2026-09-03-pantry-recipe-matching/reviews/impl-review.md`](../../archive/2026-09-03-pantry-recipe-matching/reviews/impl-review.md) — F1 skip-first-visibility (since removed); F2 in-flight overlap (now queued via `pendingRefresh`).
- [`context/changes/testing-critical-path-coverage/research.md`](../testing-critical-path-coverage/research.md) — Phase 1: ranking math in `matchRecipes`; matches API mocks `listMatches`; refetch left to Risk #5; API tests inject `locals` and skip middleware.
- [`context/foundation/prd.md`](../../foundation/prd.md) Guardrails / US-02 / US-04 — isolation NFR; pantry/recipe edits update the matching list.

## Related Research

- `context/changes/testing-critical-path-coverage/research.md` — Phase 1 grounding
- `context/archive/2026-09-03-pantry-recipe-matching/research.md`
- `context/foundation/test-plan.md` §2 Risks #2, #4, #5

## Test-plan corrections (for `/10x-test-plan` backport — §2 wording/guidance only, no file anchors)

1. **Risk #4 Prove:** there is no PUT; mutate is PATCH/DELETE; foreign id is **404**, not 403. Create-ignores-household-id still stands.
2. **Risk #2 / #4 cheapest layer:** “two-user fixtures” in this stack means two household ids in a Vitest fake that honors filters — **not** live RLS. RLS stays a later/manual concern (archive already said pgTAP is out).
3. **Risk #2 Source hot-spot `src/pages/api`:** incomplete. Household selection is session/cookie/membership; filters are services. Keep the dir as likelihood evidence if desired; do not treat API handlers as the only failure site.
4. **Risk #5 Source hot-spot `src/components`:** misleading for Topbar-Home / SSR. Primary recompute is list-on-read; the island is bfcache/tab only. No e2e this phase.
5. **Risk #5 is not a stored-rank bug.** Keep the user scenario; cheapest prove is list-after-write at the matching load, not a kitchen Playwright flow.

## Open Questions

1. **Middleware catch-path** (cookie trusted when `listMemberships` throws): worth a Phase 2 mocked-middleware test, or leave as residual behind RLS? **Recommendation:** do not block Phase 2 on it; lock `resolveHouseholdId`; mention catch in plan Open Risks.
2. **Shared in-memory Supabase fake** vs one-off builders in pantry/recipe tests: planning choice. One helper reduces clone risk; keep it small (eq + insert/update/delete + single/count).
3. **`save_recipe` foreign id:** fake the RPC (id+household) vs only table-shaped delete/get. **Recommendation:** fake RPC contract (`Recipe not found` when id/household miss) rather than reimplementing the SQL function.
4. **qty/Check oracle** for list-after-write: reuse Phase 1 product law (live scorer). Do not assert archived “quantities ignored.”

## Follow-up Research 2026-09-08T14:11+02:00

Parallel traces ([household isolation](8bb90cbb-9374-41c4-a4e2-cac7421da9a5), [IDOR mutate paths](d198fcae-d9e4-410f-9443-5725ee38ffe1), [list-after-write rerank](c5a42724-e223-4bd7-a438-a4fb881b5cd7), [archive isolation IDOR history](a2b9826b-fabe-4f77-a1f7-5787ab5c58a9)) agreed with the main findings. Deltas folded in:

1. **401 on mutate is untested, not unimplemented.** Pantry/recipe PATCH/DELETE still 401 when `user` is missing; suites only assert 401 on GET list. That is still **not** an IDOR proof — do not pad Phase 2 with extra 401 clones.
2. **Live two-JWT Supabase** would be the only way to exercise RLS. Phase 2 stack forbids it (`vi.mock` of `@/lib/supabase`, node Vitest, no e2e). Keep RLS as a later/manual layer; cheapest Phase 2 isolation is `resolveHouseholdId` + an in-memory store that honors `eq`. A true A→B leak today still needs **both** app-layer and RLS to fail.
3. **GET `/api/matches` cache** (`Content-Type` only, no `cache: "no-store"` on the island fetch) is speculative. Do not promote it to a Phase 2 case.
4. **Matching research vs plan:** pantry-page refetch was considered and rejected; US-02 is next-show on `/`, not a `PantryManager` hook.
