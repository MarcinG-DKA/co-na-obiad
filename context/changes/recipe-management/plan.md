# Recipe Management Implementation Plan

## Overview

Add household recipe CRUD with nested ingredient lists and ordered cooking steps so US-04 / FR-005 is real before S-03 matching. Users manage a library on `/recipes` and edit on `/recipes/new` and `/recipes/:id`, using the pantry JSON-API + React-island pattern, plus one atomic save RPC so replace-all cannot leave a half-written ingredient list.

## Current State Analysis

Pantry (S-01) is the vertical slice to copy. Recipes do not exist in `src/` or `supabase/` yet.

- **Database:** `households`, `household_members`, `pantry_items`. RLS via `is_household_member()`. Shared `update_updated_at()` already exists; execute is revoked from `public` / `anon` / `authenticated`.
- **JSON API:** `{ data, error }`, `prerender = false`, Zod in `src/lib/*-schemas.ts`, `jsonResponse` in `src/lib/api.ts`, household id from `Astro.locals` only.
- **Service:** Colocated domain types and `*NotFoundError`; throw on PostgREST errors; 0-row DELETE uses `{ count: "exact" }` → 404.
- **UI:** SSR seed + optimistic React island, Sonner toasts, confirm-before-delete, per-row rollback, `!supabase` treated as load error not empty list.
- **Tests:** Jest is required (`context/foundation/lessons.md`). Pantry has schema, service, and API suites; API tests mock `@/lib/supabase`. CI runs `npm test` after lint.
- **Routing:** `PROTECTED_ROUTES` uses `pathname.startsWith`, so adding `"/recipes"` covers list, `/recipes/new`, and `/recipes/:id`. No Astro `[id]` pages yet — only `src/pages/api/pantry/[id].ts`.
- **Transactions:** The Supabase JS client has no multi-statement transaction. Sequential delete-then-insert from the worker is not atomic.

### Key Discoveries:

- `is_household_member(p_household_id)` is the RLS helper to reuse — no new membership function.
- Attach `update_updated_at` triggers to new tables; do not recreate the function.
- `join_household` is the DEFINER + `search_path = public` + revoke/grant pattern to copy for the save RPC only (`supabase/migrations/20260901141851_household_data_scaffold.sql`).
- Pantry impl-review contracts still apply: Zod ↔ UI parity, 0-row → 404, confirm delete, load-error vs empty, shared `jsonResponse`, selective optimistic rollback (`context/archive/2026-09-02-pantry-management/reviews/impl-review.md`).
- Roadmap risk for this slice: free-text ingredient names (same as pantry) will make S-03 matching noisy; that is accepted, not fixed here.
- `src/types.ts` still does not exist; pantry types live in the service. Keep recipe DTOs colocated until S-03 needs to share pantry + recipe types.

## Desired End State

A logged-in household member can:

- Open `/recipes` and see the household library (titles; empty state when there are none).
- Create a recipe on `/recipes/new` with a title, at least one named ingredient (optional quantity/unit), and optional ordered steps.
- Edit that recipe on `/recipes/:id` and Save — title, steps, and the full ingredient list persist as one snapshot.
- Delete a recipe from the list after confirm; child ingredients cascade.
- See toast errors on failed mutations; a missing Supabase client or query failure is a load error, not an empty library.
- Never see another household's recipes (RLS).

S-03 can later `SELECT` `recipe_ingredients.name` joined to `pantry_items.name` without a schema rewrite.

**Verification:** `npm run lint`, `npm test`, and `npm run build` pass; generated types include `recipes` and `recipe_ingredients`; Jest covers schema, service (including replace-all and 404), and API; manual SQL proves isolation; browser CRUD on list + editor works.

## What We're NOT Doing

- **Pantry-recipe matching UI or scoring** — S-03.
- **Ingredient catalog, autocomplete, stemming, or pantry pickers** — free-text, trimmed, same as pantry names.
- **Favorites (FR-006)**, photos, tags, servings, cook time, public catalog, AI, shopping list.
- **Per-ingredient API routes** — editor saves the whole list in one request.
- **Draft vs ready status** — a recipe is invalid without at least one ingredient.
- **Drag-and-drop step/ingredient reorder** — array order is position; add/remove is enough.
- **Optimistic per-keystroke editor saves** — the editor uses explicit Save.
- **Playwright / React Testing Library** — Jest at schema + service + API only; UI is manual.
- **`src/types.ts` extraction** — still deferred to S-03 (or whenever matching needs shared DTOs).
- **pgTAP** — manual SQL isolation only, same as pantry.
- **Recreating `update_updated_at()`** or broadening DEFINER CRUD beyond the save RPC.

## Implementation Approach

Three sequential phases: **schema + atomic save RPC → service + JSON API + Jest → list/editor UI**.

Reads, list, get-by-id, and delete use **direct RLS** like pantry. Create and update go through **`save_recipe`**: one transaction that upserts the recipe row (title + `steps text[]`) and replaces `recipe_ingredients`. The API still takes `householdId` from `Astro.locals` and never from the client body.

## Critical Implementation Details

### Atomic save (no JS transaction)

PostgREST cannot wrap DELETE + INSERT in one client transaction. Implement `save_recipe` in Postgres (SECURITY DEFINER, `set search_path = public`, membership check, revoke/grant like `join_household`). Ordinary SELECT/DELETE stay on tables with RLS. Do not implement replace-all as two sequential `.from()` calls in the service.

### `/recipes/new` vs `[id]`

Astro prefers static routes over dynamic ones. Add `src/pages/recipes/new.astro` **and** `src/pages/recipes/[id].astro` so `id` is never the string `"new"`. Adding `"/recipes"` to `PROTECTED_ROUTES` is enough for all three paths (`startsWith`).

### Nested write UX

The detail editor is a form: Save sends the full payload. Last-write-wins if two members edit the same recipe. List delete stays optimistic with **per-row** rollback and `window.confirm`, matching pantry after impl-review F2/F4.

---

## Phase 1: Schema, RLS, and save RPC

### Overview

Create `recipes` and `recipe_ingredients`, wire RLS and `updated_at` triggers, add the atomic `save_recipe` RPC, and regenerate types.

### Changes Required:

#### 1. Recipes migration

**File**: `supabase/migrations/<timestamp>_recipe_management.sql`

**Intent**: Persist household recipes with ordered ingredients and optional steps, isolated by membership, with an atomic save path for nested writes.

**Contract**:
- Table `recipes`: `id` uuid PK default `gen_random_uuid()`, `household_id` uuid NOT NULL FK → `households` ON DELETE CASCADE, `title` text NOT NULL, `steps` text[] NOT NULL default `'{}'`, `created_at` / `updated_at` timestamptz default `now()`. Index on `household_id`.
- Table `recipe_ingredients`: `id` uuid PK, `recipe_id` uuid NOT NULL FK → `recipes` ON DELETE CASCADE, `household_id` uuid NOT NULL FK → `households` ON DELETE CASCADE (denormalized for pantry-style RLS), `name` text NOT NULL, `quantity` numeric nullable, `unit` text nullable, `position` int NOT NULL, timestamps. Index on `recipe_id` and `household_id`. Unique `(recipe_id, position)`.
- RLS enabled on both. Four `authenticated` policies per table using `is_household_member(household_id)` for SELECT/INSERT/UPDATE/DELETE (WITH CHECK on INSERT/UPDATE), same shape as `pantry_items`.
- Triggers `recipes_updated_at` and `recipe_ingredients_updated_at` BEFORE UPDATE calling existing `update_updated_at()`.
- Function `save_recipe(p_household_id uuid, p_recipe_id uuid, p_title text, p_steps text[], p_ingredients jsonb) returns uuid`:
  - SECURITY DEFINER, `set search_path = public`.
  - Reject if `auth.uid()` is null or `NOT is_household_member(p_household_id)`.
  - `p_recipe_id` null → INSERT recipe; non-null → UPDATE that id only if `household_id = p_household_id`, else no row / raise (service maps to not found).
  - Replace ingredients: delete existing rows for that recipe, insert from `p_ingredients` in array order (`position` = 0-based index). Copy `household_id` from the recipe row, not from JSON.
  - Reject empty ingredient array or blank names (RPC raise); quantity/unit may be null.
  - Return the recipe `id`.
  - `REVOKE ALL` on the function from `PUBLIC`, `anon`; `GRANT EXECUTE` to `authenticated` only.

#### 2. Regenerate types

**File**: `src/db/database.types.ts`

**Intent**: Expose `recipes`, `recipe_ingredients`, and `save_recipe` to TypeScript.

**Contract**: After `npx supabase db push --linked`, run `npm run db:types`. Generated types include both tables and `Functions["save_recipe"]`.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push --linked`
- Types regenerate without error: `npm run db:types`
- Existing tests still pass: `npm test`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- As a household member, INSERT a recipe + ingredients (or call `save_recipe`) — succeeds; `steps` round-trip in order.
- SELECT those rows as a user who is not a member — empty (RLS).
- INSERT / `save_recipe` with a `household_id` the user does not belong to — rejected.
- `save_recipe` with zero ingredients — error; leftover ingredient rows must not exist for a new id.
- UPDATE a recipe; `updated_at` changes.
- DELETE a recipe as a member — ingredients cascade away. DELETE as a non-member — no rows affected.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Service layer, JSON API, and Jest

### Overview

Typed recipe service, Zod payloads, JSON routes matching pantry conventions, and colocated Jest for schema + service + API (including nested save and 404).

### Changes Required:

#### 1. Zod schemas

**File**: `src/lib/recipe-schemas.ts`

**Intent**: Single source of request validation aligned with the UI (lessons.md + pantry F1).

**Contract**:
- Ingredient: `name` trim 1–200; `quantity` `.positive().nullable().optional()`; `unit` trim max 50 nullable optional.
- Recipe write body: `title` trim 1–200; `steps` array of trimmed strings (empty strings dropped or rejected — pick one and test it); `ingredients` array min 1 of the ingredient object.
- Export schemas used by POST (create) and PATCH (update). Same shape for both (full replace).

#### 2. Recipe service

**File**: `src/lib/services/recipe.ts`

**Intent**: Encapsulate list/get/save/delete; domain types stay in this file.

**Contract**:
- Types: `RecipeIngredient`, `Recipe` (header + `ingredients` ordered by `position`, `steps: string[]`), `RecipeListItem` (header + `ingredient_count` or equivalent — no requirement to embed full lines on the list).
- `RecipeNotFoundError` analogous to `PantryNotFoundError`.
- `listRecipes(supabase, householdId)` — household filter, stable order (`created_at` asc), throw on error, `[]` only when empty.
- `getRecipe(supabase, recipeId, householdId)` — recipe + ingredients; missing → `RecipeNotFoundError`.
- `saveRecipe(supabase, householdId, input, recipeId?: string)` — `supabase.rpc("save_recipe", …)` then `getRecipe`; RPC/membership miss → not found or thrown error (do not swallow). Never pass `household_id` from the request body; argument is `locals.householdId`.
- `removeRecipe(supabase, recipeId, householdId)` — delete with `{ count: "exact" }`, 0 rows → `RecipeNotFoundError`.
- List/get/delete are table queries (RLS). Only save uses the RPC.

#### 3. API: collection

**File**: `src/pages/api/recipes/index.ts`

**Intent**: List and create for the current household.

**Contract**:
- `export const prerender = false`; `GET` + `POST`.
- Guards: no user → 401; no `householdId` → 400 `"No household"`; use `jsonResponse`.
- GET → `{ data: RecipeListItem[] }`.
- POST → parse JSON with create schema; `saveRecipe` without id; 201 `{ data: Recipe }`.

#### 4. API: member

**File**: `src/pages/api/recipes/[id].ts`

**Intent**: Read, replace-all update, and delete one recipe.

**Contract**:
- `prerender = false`; `GET` + `PATCH` + `DELETE`; `params.id` required or 400.
- Same auth/household guards as collection.
- GET → `{ data: Recipe }` or 404.
- PATCH → full write schema; `saveRecipe` with id; 404 on not found.
- DELETE → `removeRecipe`; 200 `{ data: null }`; 404 on 0 rows.
- Map `RecipeNotFoundError` to 404, not 500.

#### 5. Jest suites

**Files**:
- `src/lib/recipe-schemas.test.ts`
- `src/lib/services/recipe.test.ts`
- `src/pages/api/recipes/recipes-api.test.ts`

**Intent**: Guard nested validation, RPC save, and HTTP mapping in CI (`context/foundation/lessons.md`).

**Contract**:
- Schemas: trim; reject empty title; reject 0 ingredients; reject quantity `0`; accept null quantity/unit; steps array behavior as implemented.
- Service: list throw vs empty; get 404; save calls `rpc` with household id + payload and reloads; remove 0-count → not found.
- API: `jest.mock("@/lib/supabase")`; 401 / 400 no household / 400 invalid JSON / 201 create / 404 get-patch-delete / 200 delete. Do not load `astro:env`.

### Success Criteria:

#### Automated Verification:

- Colocated Jest suites exist for recipe schemas, service, and API; API tests mock `@/lib/supabase`
- All tests pass: `npm test`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors in new files

#### Manual Verification:

- `GET /api/recipes` returns `{ data: [] }` for a household with no recipes.
- `POST /api/recipes` with title + one ingredient + optional steps returns 201 and persisted lines in order.
- `POST` with empty ingredients or empty title returns 400.
- `GET /api/recipes/<id>` returns the full recipe; unknown id returns 404.
- `PATCH /api/recipes/<id>` replaces the ingredient list (old names gone).
- `DELETE /api/recipes/<id>` returns 200; subsequent GET is 404.
- Unauthenticated → 401; no household → 400.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Recipes UI

### Overview

Protected list + create/edit pages, nav links, and pantry-grade error/empty/delete behavior. Matching UI stays out.

### Changes Required:

#### 1. Recipe list island

**File**: `src/components/recipes/RecipeList.tsx`

**Intent**: Show the household library and delete with confirm + per-row optimistic rollback.

**Contract**:
- Props: `initialRecipes` list items from SSR.
- Empty state when the array is empty (not when load failed — that stays on the Astro page).
- Link each title to `/recipes/[id]`; a control to `/recipes/new`.
- Delete: `window.confirm` then optimistic remove → `DELETE /api/recipes/:id` → re-append **only that row** on failure + `toast.error`.
- Cosmic glass styling, `cn()`, existing Button/sonner — no new design system.

#### 2. Recipe editor island

**File**: `src/components/recipes/RecipeEditor.tsx`

**Intent**: Create or update a recipe with explicit Save of the full nested payload.

**Contract**:
- Create mode (`/recipes/new`): empty title, one blank ingredient row, no steps (or one empty step row the user can ignore — must not POST blank names).
- Edit mode: hydrate from SSR `Recipe`.
- Fields: title; ingredient rows (name required, quantity/unit optional, add/remove); step rows (add/remove; order = array order).
- Client checks must match Zod (quantity `min={1}` if present, at least one named ingredient).
- Save: POST `/api/recipes` or PATCH `/api/recipes/:id`; loading/disabled on the button; toast on error; on successful create, navigate to `/recipes/:id` or `/recipes`.
- Not per-keystroke optimistic replace-all.

#### 3. Pages

**Files**:
- `src/pages/recipes/index.astro` (or `src/pages/recipes.astro` — pick one list URL `/recipes`)
- `src/pages/recipes/new.astro`
- `src/pages/recipes/[id].astro`

**Intent**: SSR-load list or recipe; distinguish no household, load error, and empty/not found.

**Contract**:
- Layout titles: Recipes / New recipe / recipe title.
- `createClient` + `householdId` like `src/pages/pantry.astro`.
- `!supabase && householdId` → load error, not empty list.
- No household → same copy pattern as pantry (`No household found.`).
- List: `listRecipes` then `<RecipeList client:load />`.
- New: editor in create mode (no GET).
- `[id]`: `getRecipe`; not found → not-found message (not an empty editor); else `<RecipeEditor client:load />`.
- Back link to `/recipes` from editor; list links back to dashboard.

#### 4. Protect and navigate

**Files**: `src/middleware.ts`, `src/pages/dashboard.astro`, `src/components/Topbar.astro`

**Intent**: Auth-gate the whole `/recipes` prefix and make the library reachable next to Pantry.

**Contract**: Add `"/recipes"` to `PROTECTED_ROUTES`. Dashboard + authenticated Topbar links to `/recipes`, same visual language as Pantry. Toaster already in `Layout.astro` — do not duplicate.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Tests still pass: `npm test`
- Build succeeds: `npm run build`
- No TypeScript errors

#### Manual Verification:

- Logged in, `/recipes` shows empty state; unauthenticated request redirects to `/auth/signin`.
- Create via `/recipes/new` with title, two ingredients, two steps — appears on the list; reopen `/recipes/:id` and see the same data.
- Save after removing an ingredient — that line is gone (replace-all).
- Save with zero named ingredients — blocked in UI and/or 400; recipe not emptied server-side.
- Delete from the list after confirm — gone; cancel confirm — still there; failed DELETE restores only that row.
- Network failure on Save — toast, form data still visible.
- Kill client construction / force load error — error copy, not an empty library.
- Other household's user does not see the recipes.
- Dashboard and Topbar reach `/recipes`; `/recipes/new` does not render the `[id]` editor as id `new`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Zod: trim, title required, ingredients min 1, quantity 0 rejected, optional unit, steps handling.
- Service: list empty vs throw; get/save/remove not-found; `saveRecipe` invokes `rpc` then reloads; household id argument is the locals value.

### Integration Tests:

- API handler tests (mocked supabase/service), not live PostgREST. Live nested atomicity is Phase 1 SQL + Phase 2/3 manual.

### Manual Testing Steps:

1. Full create → edit replace-all → delete cycle in the browser.
2. Cross-household isolation (SQL + second user).
3. Empty library vs load error vs not-found editor.
4. Confirm cancel on delete.
5. Unauthenticated `/recipes` redirect.
6. No-household message.

## Performance Considerations

- List query is household-scoped with `recipes(household_id)` index; no pagination (tens of household recipes).
- List payload stays lean (`RecipeListItem`); full ingredients load on the editor GET only.
- S-03 can join `recipe_ingredients` by `recipe_id` / `household_id` without scanning JSON.

## Migration Notes

- Push to the linked project: `npx supabase db push --linked`, then `npm run db:types`.
- No backfill — no existing recipes.
- Rollback is `DROP FUNCTION save_recipe(...)` then drop tables (ingredients first or CASCADE).

## References

- Change: `context/changes/recipe-management/change.md`
- Prior slice: `context/archive/2026-09-02-pantry-management/plan.md`
- Pantry impl-review: `context/archive/2026-09-02-pantry-management/reviews/impl-review.md`
- Lessons: `context/foundation/lessons.md` — Jest with service and API work
- PRD: `context/foundation/prd.md` — US-04, FR-005
- Roadmap: `context/foundation/roadmap.md` — S-02
- RLS helper: `is_household_member()` in `supabase/migrations/20260901141851_household_data_scaffold.sql`
- DEFINER grant pattern: `join_household` in the same migration
- JSON helper: `src/lib/api.ts`
- Pantry service/API/UI: `src/lib/services/pantry.ts`, `src/pages/api/pantry/`, `src/pages/pantry.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, and save RPC

#### Automated

- [x] 1.1 Migration applies cleanly
- [x] 1.2 Types regenerate without error
- [x] 1.3 Existing tests still pass
- [x] 1.4 Lint passes
- [x] 1.5 Build succeeds

#### Manual

- [x] 1.6 Member save/insert of recipe + ingredients succeeds; steps round-trip in order
- [x] 1.7 SELECT as non-member returns empty
- [x] 1.8 Write with wrong household_id rejected
- [x] 1.9 save_recipe with zero ingredients errors and does not leave orphan rows
- [x] 1.10 UPDATE triggers updated_at auto-update
- [x] 1.11 DELETE as member cascades ingredients; DELETE as non-member is a no-op

### Phase 2: Service layer, JSON API, and Jest

#### Automated

- [ ] 2.1 Colocated Jest suites exist for recipe schemas, service, and API; API tests mock @/lib/supabase
- [ ] 2.2 All tests pass
- [ ] 2.3 Lint passes
- [ ] 2.4 Build succeeds
- [ ] 2.5 No TypeScript errors in new files

#### Manual

- [ ] 2.6 GET /api/recipes returns empty array for new household
- [ ] 2.7 POST /api/recipes creates recipe with ingredients/steps and returns 201
- [ ] 2.8 POST with invalid body (empty title or zero ingredients) returns 400
- [ ] 2.9 GET /api/recipes/:id returns full recipe; unknown id returns 404
- [ ] 2.10 PATCH /api/recipes/:id replaces the ingredient list
- [ ] 2.11 DELETE /api/recipes/:id removes recipe; subsequent GET is 404
- [ ] 2.12 Unauthenticated requests return 401
- [ ] 2.13 No-household requests return 400

### Phase 3: Recipes UI

#### Automated

- [ ] 3.1 Lint passes
- [ ] 3.2 Tests still pass
- [ ] 3.3 Build succeeds
- [ ] 3.4 No TypeScript errors

#### Manual

- [ ] 3.5 Empty library state and unauthenticated redirect
- [ ] 3.6 Create with title, ingredients, and steps persists on list and detail
- [ ] 3.7 Save after removing an ingredient persists replace-all
- [ ] 3.8 Zero named ingredients blocked; server list not emptied
- [ ] 3.9 List delete confirm / cancel / per-row rollback on failed DELETE
- [ ] 3.10 Network failure on Save shows toast; form data remains
- [ ] 3.11 Load error is not an empty library
- [ ] 3.12 Cross-household isolation in the browser
- [ ] 3.13 Dashboard and Topbar link to /recipes; /recipes/new is not the [id] editor
