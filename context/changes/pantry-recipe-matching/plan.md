# Pantry-Recipe Matching Implementation Plan

## Overview

Rank the household recipe library by pantry ingredient overlap (coverage score, case-insensitive exact name match, no matching library) and show that list on `/dashboard` — the household page after login. Pantry and recipe editors stay on `/pantry` and `/recipes`; returning to the dashboard (SSR or an on-screen refetch of `GET /api/matches`) re-ranks the list.

## Current State Analysis

S-01 pantry CRUD and S-02 recipe CRUD are in production shape. Matching is greenfield.

- **Scoring:** No overlap scorer, no fuzzy/search dependency, no `/api/matches`. `package.json` has no matching libraries; Cloudflare `workerd` is a reason to keep ranking as pure TypeScript.
- **Data:** `pantry_items.name` and `recipe_ingredients.name` are independent free-text strings (trim, 1–200). Writes do **not** lowercase names. Units (`ml` / `g` / `pcs`) and quantities are ignored for v1 coverage.
- **Reads:** `listPantryItems` already returns names. `listRecipes` selects `recipe_ingredients(count)` only (`src/lib/services/recipe.ts`). `getRecipe` has names but N+1 would be the matching latency trap.
- **UI:** `/dashboard` is a hub (invite code + links). `/pantry` and `/recipes` are SSR-seeded React islands. Sign-in redirects to `/` (Welcome), not the household page. `PROTECTED_ROUTES` already includes `/dashboard`.
- **US-02 / US-04:** PantryManager mutates in place on `/pantry`; the ranked list will not be mounted there. Recipe save navigates to `/recipes/:id`. Re-rank is “list is correct the next time it is on-screen,” plus a client refetch when the dashboard island is visible (including `pageshow` after back/bfcache).
- **Tests:** `context/foundation/lessons.md` requires colocated Jest for new services and API routes; mock `@/lib/supabase` in API tests.
- **Types:** `src/types.ts` still does not exist. Pantry/recipe DTOs stay in their services; matching DTOs colocate in the matching module.

Research settled the algorithm (coverage, not Jaccard; exact match after trim+lowercase; no library; two household-scoped reads then score in TS). Planning settled placement, zero-score rows, card contents, empty states, and post-login redirect.

## Desired End State

A logged-in household member can:

- Land on `/dashboard` after password sign-in and see saved recipes ranked by pantry overlap.
- Read a match **score** and the **missing ingredient names** on each row; open the recipe via the existing `/recipes/:id` editor.
- See zero-overlap recipes at the **bottom** (not hidden). An empty pantry still lists every recipe at score 0 with every ingredient missing. An empty library shows the existing-style empty state with a CTA to add a recipe.
- Trust that editing pantry or recipes updates ranking the next time the dashboard list is shown (full load or on-screen refetch). No realtime channel.
- Never see another household’s recipes (same `locals.householdId` + RLS path as pantry/recipes).

**Verification:** `npm test`, `npm run lint`, and `npm run build` pass; Jest covers the scorer, `listRecipesWithIngredients` / `listMatches`, and `GET /api/matches`; browser checks ranking, missing names, empty states, and re-rank after a pantry edit.

### Key Discoveries:

- Coverage formula and “no library” verdict: `context/changes/pantry-recipe-matching/research.md` (summary + follow-ups).
- `listRecipes` cannot feed the scorer without a nested name select — `src/lib/services/recipe.ts` `RECIPE_LIST_SELECT` vs `RECIPE_DETAIL_SELECT`.
- Dashboard is still links-only — `src/pages/dashboard.astro`.
- Sign-in success goes to `/` — `src/pages/api/auth/signin.ts`. Household join already redirects to `/dashboard`.
- API envelope, auth, and household checks to copy — `src/pages/api/pantry/index.ts` (`prerender = false`, `{ data }` / `{ error }`, 401 / 400 / 500).
- List chrome to copy — `src/components/recipes/RecipeList.tsx` (bordered rows, title link, empty icon + muted copy).
- Compare-time `trim` + `toLowerCase` is required; persist path keeps original case (`src/lib/pantry-schemas.ts`, `save_recipe` trim-only).

## What We're NOT Doing

- **Matching libraries** (Fuse.js, rapidfuzz-js, Elasticsearch, Meilisearch, pgvector, Vectorize, LLM).
- **Fuzzy, substring, stemming, synonyms, or a global ingredients table.**
- **Quantity/unit sufficiency** — names only.
- **SQL RPC / view** to rank in Postgres.
- **Realtime** re-rank (`has_realtime: false`).
- **A dedicated `/matches` page** — dashboard is the ranked list; `/pantry` and `/recipes` stay editors.
- **Mounting the ranked list on `/pantry`** or wiring PantryManager to fetch matches (list is not on that page).
- **Showing matched names** on the card (score + missing names only).
- **Hiding zero-score recipes.**
- **`src/types.ts` extraction** — still optional; not required to share DTOs.
- **Changing `listRecipes`** used by `/recipes` (count-only list stays).
- **Playwright / React Testing Library** — Jest at scorer + service + API; UI is manual.
- **Favorites, substitution, shopping list, public catalog, S-04 stale reminder.**

## Implementation Approach

Three sequential phases: **pure scorer + household loader → JSON API → dashboard island + sign-in redirect**.

`matchRecipes` is a pure function (Jest, no Supabase). `listMatches` loads pantry + recipes-with-ingredient-names in **parallel** (two queries, not `getRecipe` per row), then scores. `GET /api/matches` is the client source of truth with the same auth/household gate as pantry. Dashboard SSR seeds the island; the island refetches when it is on-screen again so US-02 holds without putting the list on `/pantry`.

## Critical Implementation Details

### Compare-time normalize, unique names

Stored names keep user casing. Normalize with `trim` + `toLowerCase` only inside the scorer. Coverage uses **unique** normalized names on each side (`Set` intersection). Denominator is the recipe’s unique normalized ingredient names, not raw row count (duplicate “eggs” lines must not halve the score). If that set is empty, score is `0` (no division by zero). `matchedNames` / `missingNames` keep the recipe’s original spelling (first occurrence).

### Two reads, never N+1

`listMatches` must `Promise.all` `listPantryItems` and `listRecipesWithIngredients`. Do not loop `getRecipe`. Do not sequential-await the two lists unless a typed client forces it — parallel is the intended contract.

### Re-rank without a pantry-page list

Do not add match fetches to `PantryManager`. The dashboard island refetches `GET /api/matches` when it becomes visible again (`pageshow` including `event.persisted`, and/or `document.visibilitychange` when `visible`) so back-navigation / bfcache does not show a stale ranking. A full navigation to `/dashboard` SSR-recomputes on first paint.

---

## Phase 1: Coverage scorer and household loader

### Overview

Add a testable matching module and a nested recipe-list read so ranking can run without HTTP or UI.

### Changes Required:

#### 1. Nested recipe list for matching

**File**: `src/lib/services/recipe.ts`

**Intent**: Load household recipes with ingredient names in one query so matching does not N+1 `getRecipe` or reuse the count-only list select.

**Contract**: Add `listRecipesWithIngredients(supabase, householdId)` filtered by `household_id`, ordered stably (e.g. `created_at` asc). Nested select includes ingredient `name` (and enough fields to map a small `{ id, title, ingredients: { name }[] }` result). Do **not** change `RECIPE_LIST_SELECT` / `listRecipes`. Omit `steps` from this select. Throw on PostgREST error like `listRecipes`. Extend `src/lib/services/recipe.test.ts` for success, empty list, and error.

#### 2. Matching service

**File**: `src/lib/services/matching.ts`

**Intent**: Own normalize, coverage scoring, sort, and the household orchestration used by the API and dashboard.

**Contract**:
- Colocate DTOs here (e.g. `RecipeMatch`: `recipeId`, `title`, `score` in `[0, 1]`, `matchedNames`, `missingNames`). Reuse `PantryItem` from pantry; do not create `src/types.ts`.
- `normalizeName(name: string): string` — `trim` + `toLowerCase`. Empty after trim is not a match key.
- `matchRecipes(pantry, recipes): RecipeMatch[]` — pure. Score = `|pantryNames ∩ recipeNames| / |recipeNames|` on unique normalized names; empty recipe-name set → `0`. Sort: score descending, `missingNames.length` ascending, `title` via `localeCompare`. Include score-`0` rows.
- `listMatches(supabase, householdId): Promise<RecipeMatch[]>` — `Promise.all` pantry list + `listRecipesWithIngredients`, then `matchRecipes`. Errors propagate (callers map to 500 / load error).

#### 3. Scorer and orchestration tests

**File**: `src/lib/services/matching.test.ts`

**Intent**: Lock the product meaning of “match” in CI before any UI exists.

**Contract**: Colocated Jest, `units.test.ts` style for `matchRecipes` (no Supabase). Cover at least: omelette vs cake given eggs/milk (omelette ranks higher); `Eggs` vs `eggs`; trim; empty pantry → all scores `0` and all recipe ingredient names missing; empty recipe list → `[]`; duplicate pantry or recipe names do not distort unique-set coverage; empty ingredient list → score `0`; sort ties on title. `listMatches` tests may mock the two list functions or the Supabase client — assert parallel load + scored output, not query strings.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- None this phase (no user-facing surface yet).

**Implementation Note**: After automated verification passes, pause for a human skim of the scorer fixtures (omelette/cake, empty pantry) before Phase 2.

---

## Phase 2: GET /api/matches

### Overview

Expose ranked matches as JSON with the same auth, household, and error envelope as pantry/recipes.

### Changes Required:

#### 1. Matches API route

**File**: `src/pages/api/matches/index.ts`

**Intent**: Give the dashboard island (and tests) a single household-scoped read of the ranked list.

**Contract**: `export const prerender = false`. `GET` only. `!locals.user` → `{ error: "Not authenticated" }` 401. `!householdId` → `{ error: "No household" }` 400. Missing Supabase client → `{ error: "Supabase is not configured" }` 500. Success → `{ data: RecipeMatch[] }` 200 via `jsonResponse`. Loader/service throw → 500 with a stable message (e.g. `"Could not load matches"`). No query params; no Zod. `householdId` from `locals` only.

#### 2. API tests

**File**: `src/pages/api/matches/matches-api.test.ts`

**Intent**: Guard the HTTP contract in CI per `lessons.md`.

**Contract**: Mock `@/lib/supabase` (`createClient`). Mock `listMatches` (keep other matching exports real if imported). Fake `APIContext` like `pantry-api.test.ts`. Assert 401, 400 no household, 500 when client missing, 500 when `listMatches` throws, 200 `{ data: [...] }` and that `listMatches` was called with the locals `householdId`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Authenticated `GET /api/matches` returns `{ data: [...] }` ordered by score (curl or browser against local `npm run dev`).
- Unauthenticated request returns 401.

**Implementation Note**: After automated verification passes, pause for the human to confirm the GET envelope before Phase 3.

---

## Phase 3: Dashboard ranked list and post-login redirect

### Overview

Make `/dashboard` the household ranked-list page, seed it from the server, refetch when the list is on-screen again, and send sign-in there.

### Changes Required:

#### 1. Match list island

**File**: `src/components/matches/MatchList.tsx`

**Intent**: Render the ranked recipes with score and missing names, including empty-library and load-error states, and refresh when the dashboard is visible again.

**Contract**: React island (`client:load`), no Next.js directives. Props: `initialMatches: RecipeMatch[]` (and a load-error flag if the page prefers passing error vs empty). Rows: title links to `/recipes/:id`; score shown as a rounded percent (`Math.round(score * 100)` + `%`); missing names listed (empty missing list when fully matched). Zero-score rows stay visible in API order. Empty `matches` → empty state with CTA to `/recipes/new` (same visual language as `RecipeList`: lucide icon, muted copy). On `pageshow` (including persisted) and when the document becomes `visible`, `GET /api/matches` and replace list state on success; toast on refetch failure (do not clear the SSR list). Do not refetch in a tight loop.

#### 2. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the hub-only body with the ranked list while keeping household invite, pantry/recipes links, and sign-out.

**Contract**: If `supabase` + `householdId`, call `listMatches` in frontmatter (try/catch → load error, not an empty library). Pass results into `MatchList` `client:load`. Keep invite-code load/error behavior. Layout: same cosmic glass card as pantry/recipes (`max-w-lg`) so missing-name rows fit. Links to `/pantry` and `/recipes` remain. No new `PROTECTED_ROUTES` entry.

#### 3. Sign-in redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Honor PRD “ranked list after login” now that dashboard is that page.

**Contract**: Successful password sign-in redirects to `/dashboard` instead of `/`. Error redirects unchanged. Do not change sign-up confirm-email or sign-out (`/` is still fine). Join already goes to `/dashboard`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Sign in → `/dashboard` shows ranked recipes (not Welcome).
- Each row shows percent score + missing ingredient names; title opens `/recipes/:id`.
- Empty pantry: all recipes at 0% with all ingredients listed as missing.
- Empty recipe library: empty-state CTA to add a recipe; no fake rows.
- Zero-overlap recipes appear below partial/full matches.
- Add/remove a pantry item on `/pantry`, return to dashboard (link or Back): ranking and missing names update.
- Load failure shows an error, not an empty library.
- Another household’s recipes never appear.

**Implementation Note**: After automated verification passes, pause for the human to complete the manual dashboard/pantry round-trip before treating S-03 as implemented.

---

## Testing Strategy

### Unit Tests:

- `matchRecipes`: coverage math, case/trim, empty pantry, empty library, empty ingredient list, unique-name duplicates, sort (score → missing count → title).
- `listRecipesWithIngredients`: maps nested names; empty; throws on error.
- `listMatches`: combines pantry + recipes; does not call `getRecipe` per recipe.

### Integration Tests:

- `GET /api/matches`: 401 / 400 / 500 / 200 envelope; `listMatches` receives `locals.householdId`.
- No Playwright. Browser checks live in Phase 3 manual criteria.

### Manual Testing Steps:

1. Sign in with a household that has pantry items and several recipes (including one with no overlap). Confirm dashboard ranking, percents, and missing names.
2. Open a row → recipe editor → Back to dashboard; list still coherent.
3. Clear or empty the pantry conceptually (remove items) → all remaining recipes at 0% with missing names.
4. Delete all recipes → empty-state CTA.
5. Add a pantry item that matches a missing name → that recipe moves up after returning to dashboard.
6. Confirm invite code and pantry/recipes links still work on dashboard.

## Performance Considerations

Household lists are already unbounded (no pagination). In-memory unique-name intersection is appropriate at “few hundred” items. The hotspot to avoid is N+1 `getRecipe` and pulling `steps` into the match payload. Two parallel PostgREST calls are enough; no cache layer for v1.

## Migration Notes

No schema or data migration. Existing free-text names stay as stored; only compare-time normalize changes matching behavior. Rollback is revert of the matching module, API route, dashboard island, and sign-in redirect.

## References

- Related research: `context/changes/pantry-recipe-matching/research.md`
- Roadmap S-03: `context/foundation/roadmap.md`
- PRD business logic / US-02 / FR-004: `context/foundation/prd.md`
- Lessons (Jest + mock supabase): `context/foundation/lessons.md`
- API pattern: `src/pages/api/pantry/index.ts`
- List UI pattern: `src/components/recipes/RecipeList.tsx`
- Nested ingredient select exists on detail: `src/lib/services/recipe.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Coverage scorer and household loader

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 6701560
- [x] 1.2 Linting passes: `npm run lint` — 6701560

### Phase 2: GET /api/matches

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 6479ef6
- [x] 2.2 Linting passes: `npm run lint` — 6479ef6

#### Manual

- [x] 2.3 Authenticated `GET /api/matches` returns `{ data: [...] }` ordered by score — 6479ef6
- [x] 2.4 Unauthenticated request returns 401 — 6479ef6

### Phase 3: Dashboard ranked list and post-login redirect

#### Automated

- [x] 3.1 Unit tests pass: `npm test`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Production build passes: `npm run build`

#### Manual

- [x] 3.4 Sign in → `/dashboard` shows ranked recipes (not Welcome)
- [x] 3.5 Each row shows percent score + missing ingredient names; title opens `/recipes/:id`
- [x] 3.6 Empty pantry: all recipes at 0% with all ingredients listed as missing
- [x] 3.7 Empty recipe library: empty-state CTA to add a recipe; no fake rows
- [x] 3.8 Zero-overlap recipes appear below partial/full matches
- [x] 3.9 Add/remove a pantry item on `/pantry`, return to dashboard: ranking and missing names update
- [x] 3.10 Load failure shows an error, not an empty library
- [x] 3.11 Another household’s recipes never appear
