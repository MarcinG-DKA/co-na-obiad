---
date: 2026-09-03T13:12:11+02:00
researcher: MarcinG-DKA
git_commit: 4bce2aee456ef1664616ce0a1a3f3b9f288002cd
branch: pantry-recipe-matching
repository: MarcinG-DKA/co-na-obiad
topic: "Best way (or libraries) to implement S-03 pantry-recipe matching compatible with the locked tech stack"
tags: [research, matching, pantry, recipes, overlap-scoring, supabase, cloudflare, codebase]
status: complete
last_updated: 2026-09-03
last_updated_by: MarcinG-DKA
last_updated_note: "Added follow-up research for codebase verdict on skipping a matching library; folded stack/archive addenda (workerd, query batching, types.ts)"
---

# Research: S-03 pantry-recipe matching — algorithm and libraries

**Date**: 2026-09-03T13:12:11+02:00
**Researcher**: MarcinG-DKA
**Git Commit**: 4bce2aee456ef1664616ce0a1a3f3b9f288002cd
**Branch**: pantry-recipe-matching
**Repository**: MarcinG-DKA/co-na-obiad

## Research Question

Find the best way (or libraries) to implement S-03 from `context/foundation/roadmap.md` that is compatible with `context/foundation/tech-stack.md`.

S-03 outcome: the user sees saved recipes ranked by how well they match the household pantry; editing pantry contents re-ranks the list.

Stack constraints: Astro 6 SSR + React 19 + TypeScript + Supabase + Cloudflare Workers; `has_ai: false`; matching is “straightforward server logic” without LLM integration.

## Summary

**Do not add a matching library for v1.** Rank recipes with a small TypeScript overlap scorer in `src/lib/services/` after loading household pantry items and recipes from Supabase — the same service pattern as pantry and recipe CRUD. Household libraries are small enough that in-memory scoring on the Worker is simpler, more testable (Jest), and more explainable than Elasticsearch, Meilisearch, pgvector, Cloudflare Vectorize, or an LLM.

**Score:** coverage `matched / recipe_ingredient_count`, then sort by score desc, missing count asc, title. Match names with `trim` + lowercase exact equality. Ignore quantity/unit for v1. Refetch the ranked list after pantry mutations (US-02); no realtime.

This aligns with PRD §Business Logic (ranked list + match score, no AI) and the S-03 risk note (free-text names will be noisy; fuzzy matching would hide that).

## Detailed Findings

### Recommendation for this repo

1. Load pantry + recipes with ingredients for `Astro.locals.householdId` (existing `listPantryItems` / `getRecipe` or a dedicated list-with-ingredients helper).
2. `matchRecipes(pantry, recipes)` returns `{ recipe, score, matchedNames, missingNames }`.
3. Surface the ranked list on the household/dashboard page (PRD: after login). Pantry save already exists — refetch matches after add/edit/remove.
4. Jest the scorer (omelette vs cake given eggs/milk). No new npm dependency.

Optional later:

- **SQL RPC / view** if lists grow — PostgREST cannot order nested resources by “matched count”; a Postgres function is the documented escape hatch.
- **[rapidfuzz-js](https://github.com/sarunast/rapidfuzz-js)** `tokenSetRatio` if exact name match is too brittle. Pure JS, Node 22 / browsers / edge. Do not add it until exact match is proven insufficient.

### Scoring: coverage, not Jaccard

Coverage (`|pantry ∩ recipe| / |recipe|`) is the usual “what can I cook from this fridge” metric. A binary filter (recipe matches or it doesn’t) drops 3-of-4 recipes; coverage keeps them ranked.

Jaccard (`|A∩B| / |A∪B|`) over-penalizes longer recipes. Cosine similarity is used in NLP recipe-vector demos; it is overkill for a household library.

MealScout scores by distinct pantry hits and sorts score desc, name asc. Pantry Roulette uses `matched.length / recipe.ingredients.length`.

Quantity/unit comparison is commonly skipped at MVP.

### Name matching: exact after normalize

v1: `trim` + lowercase exact equality on `pantry_items.name` vs `recipe_ingredients.name`.

Skip Fuse.js / Levenshtein for the overlap loop. Substring matching (`salt` in `garlic salt`) creates false positives. S-03 already flags free-text names as the ranking-quality risk; fuzzy libraries would hide mismatches instead of making them visible.

Fuse.js is built for “query vs catalog”, not set overlap. rapid-fuzzy (Rust/WASM) is a worse Cloudflare Workers fit than pure TypeScript.

### Where ranking runs

| Approach | Fit |
| --- | --- |
| TypeScript service on the Worker | **Best.** Matches existing pantry/recipe services, Jest, household-scoped data. |
| Supabase RPC / SQL view | Fine if lists grow. PostgREST nested `select` cannot sort by matched count. Postgres `&&` overlap needs a `text[]` of names; we store names on child rows. |
| Client-only ranking | Possible after SSR fetch, but PRD ranking belongs on the household page after login; keep scoring server-side so the API is the source of truth. |

An Astro + Cloudflare recipe site (crockpot) keeps **ingredient-overlap as its own search mode**, separate from FTS and embeddings — the same split S-03 needs.

### What not to add in v1

- **LLM / embeddings / pgvector / Vectorize** — PRD non-goal; extra infra; scores are not explainable as “missing 2 ingredients”.
- **Meilisearch / Elasticsearch** — another service on a solo Cloudflare + Supabase MVP.
- **Normalized global `ingredients` table** — helps “chicken” vs “chicken breast” later; not required to prove overlap.
- **Realtime re-rank** — stack has `has_realtime: false`; refetch after pantry mutations.

### Library cheat sheet

| Need | Library | v1? |
| --- | --- | --- |
| Core overlap score | None (`Set` intersection) | Use this |
| Typo-tolerant names | rapidfuzz-js (`tokenSetRatio`) | Later only |
| Title search UI | Fuse.js | Not for overlap |
| Native/WASM fuzzy | rapid-fuzzy | Avoid on Workers |
| Rank in SQL | Supabase RPC or view | Later only |

## Code References

- `context/foundation/prd.md:101-120` — Business Logic (ranked list + score); Non-Goals (no AI, no substitution).
- `context/foundation/tech-stack.md` — Astro/React/TS/Supabase/Cloudflare; matching as server logic, no LLM.
- `context/foundation/roadmap.md` — S-03 outcome, US-02 + FR-004, free-text name risk.
- `src/lib/services/pantry.ts:13-35` — `PantryItem`, `listPantryItems`.
- `src/lib/services/recipe.ts:17-44` — `RecipeIngredient.name`, `Recipe` with ingredients.
- `src/lib/services/recipe.ts:103-115` — `listRecipes` returns counts only; matching needs ingredients (extend select or load details).
- `src/pages/dashboard.astro` — household page after login; current links to pantry/recipes only.
- `src/pages/pantry.astro` / `src/components/pantry/PantryManager.tsx` — pantry mutations that must trigger re-rank.
- `src/lib/units.ts` — units are `ml` / `g` / `pcs`; not used in v1 overlap.

## Architecture Insights

- APIs already return `{ data, error }`, take `householdId` from `locals` only, and keep business logic in `src/lib/services/`. Matching should follow that: Zod only if the route takes query params; scoring is pure functions + Jest colocated as `matching.test.ts`.
- `listRecipes` is list-shaped (ingredient_count). Matching needs names: either a new `listRecipesWithIngredients` or map `listRecipes` → `getRecipe`. Prefer one query with nested `recipe_ingredients`.
- Re-rank is a refetch, not a live channel. Dashboard SSR can compute matches on first paint; pantry island should refetch `/api/matches` (or reload dashboard) after successful add/update/delete.

## Historical Context (from prior changes)

- `context/archive/2026-09-02-pantry-management/` — pantry CRUD, free-text item names, optional quantity/unit (now constrained to ml/g/pcs).
- `context/archive/2026-09-02-recipe-management/` — recipes + `recipe_ingredients` with free-text names; plan risk: unnormalized names make S-03 noisy. Matching must not require a new ingredient catalog in v1.
- `context/archive/2026-09-01-household-data-scaffold/` — RLS via `is_household_member`; matching queries must stay household-scoped like pantry/recipes.

## Related Research

- This file (web/library scan, 2026-09-03) plus follow-up below (codebase verdict, same change).

## Open Questions

For `/10x-plan` (not blockers for the algorithm choice):

1. Ranked list on `/dashboard` vs a dedicated `/matches` (or `/`) route.
2. Whether zero-score recipes appear at the bottom or are hidden.
3. Whether to show missing ingredient names on each card in v1.
4. Whether pantry mutations refetch in-place or navigate back to the ranked list.

## Sources (Exa, 2026-09-03)

- https://dev.to/rkchristian/how-i-built-a-smart-recipe-finder-with-vanilla-javascript-and-a-free-api-37ln
- https://github.com/mk-knight23/MK-MealScout/blob/main/src/utils/matching.ts
- https://alexnguyen9.github.io/project/recipematcher/
- https://devpost.com/software/pantry-panther
- https://stackoverflow.com/questions/73463521/how-to-select-and-order-rows-based-on-number-of-matched-elements-in-array-from-f
- https://github.com/The-Magicians-Code/crockpot
- https://www.fusejs.io/
- https://github.com/sarunast/rapidfuzz-js
- https://github.com/derodero24/rapid-fuzzy/
- https://supabase.com/docs/reference/javascript/v1/overlaps
- https://popsql.com/learn-sql/postgresql/how-to-compare-arrays-in-postgresql
- https://www.rapidevelopers.com/how-to-build-lovable/recipe-app
- https://topinsight.co/databases/postgres-extension-pgvector-vs-vectorize/
- https://medium.com/@marcinhaupka/from-keywords-to-meaning-how-we-built-semantic-recipe-search-with-embeddings-and-pgvector-7d2994f5c23b

## Follow-up Research 2026-09-03T13:21:20+02:00

**Question:** Can we implement overlap ranking without a matching library? (schema/normalize, list vs detail selects, existing match code, household RLS, scale, refetch hooks.)

**Verdict:** Yes. Live code stores free-text names with trim-only normalize (no lowercase on names), loads ingredient names only via detail select (or a new nested list select), has no fuzzy/overlap scorer, and already scopes pantry/recipes by `household_id` + RLS. Name overlap is plain `Set` intersection after compare-time normalize; units/quantities are already constrained and do not need a matching library for coverage scoring.

### 1. How names are stored (schema, Zod, UI) — types, lengths, trim/normalize, units

**Postgres schema**

- `pantry_items.name` is `text not null` with optional `quantity numeric` and `unit text` ([supabase/migrations/20260902111000_pantry_items.sql:4-12](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902111000_pantry_items.sql#L4-L12)). No DB max length on `name`.
- `recipe_ingredients.name` is `text not null` with the same optional qty/unit shape plus `position` ([supabase/migrations/20260902151904_recipe_management.sql:15-26](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902151904_recipe_management.sql#L15-L26)).
- Units constrained to `ml` | `g` | `pcs` (or null) via check constraints ([supabase/migrations/20260902165500_constrain_units.sql:21-27](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902165500_constrain_units.sql#L21-L27)). Migration also lowercases/trims existing units before the constraint ([same file:2-19](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902165500_constrain_units.sql#L2-L19)).
- `save_recipe` trims ingredient names and title in SQL; it does **not** lowercase names ([constrain_units.sql:60-78](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902165500_constrain_units.sql#L60-L78), [110-111](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902165500_constrain_units.sql#L110-L111)). Units are `lower(trim(...))` then validated.

**Generated types** (`src/db/database.types.ts`): pantry `name: string`, `quantity: number | null`, `unit: string | null` ([86-94](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/db/database.types.ts#L86-L94)); recipe_ingredients same for name/qty/unit ([124-135](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/db/database.types.ts#L124-L135)).

**Service TypeScript interfaces**

- `PantryItem`: `name: string`, `quantity: number | null`, `unit: string | null` ([src/lib/services/pantry.ts:13-21](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L13-L21)).
- `RecipeIngredient`: same name/qty/unit fields ([src/lib/services/recipe.ts:17-25](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L17-L25)).

**Zod (API boundary)**

- Pantry add/update: `name: z.string().trim().min(1).max(200)` ([src/lib/pantry-schemas.ts:4-12](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/pantry-schemas.ts#L4-L12)). Trim only — **no** `.toLowerCase()` on names. Tests confirm trim preserves case (`"Eggs"`) ([src/lib/pantry-schemas.test.ts:12-17](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/pantry-schemas.test.ts#L12-L17)).
- Recipe ingredients: identical name rules ([src/lib/recipe-schemas.ts:3-7](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/recipe-schemas.ts#L3-L7)). Title also trim/max 200 ([10-11](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/recipe-schemas.ts#L10-L11)).
- Units: `unitSchema` preprocess trim+lowercase, then `z.enum(["ml","g","pcs"])` ([src/lib/units.ts:2-26](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/units.ts#L2-L26)). Quantity: `.positive().nullable().optional()` on both schemas.

**UI**

- `PantryManager`: client `newName.trim()` / `editName.trim()` before POST/PATCH ([src/components/pantry/PantryManager.tsx:29](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L29), [85](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L85)). Unit via `isUnit(newUnit)` ([34](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L34), [89](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L89)). Name inputs have **no** `maxLength` attribute (API Zod is the hard cap).
- `RecipeEditor`: trims ingredient names in `buildPayload` ([103](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeEditor.tsx#L103)); `maxLength={200}` on title and ingredient name inputs ([183-184](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeEditor.tsx#L183-L184), [216](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeEditor.tsx#L216)). Units via `UnitSelect` over `UNITS` ([src/components/ui/unit-select.tsx:35-39](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/ui/unit-select.tsx#L35-L39)).
- Persist path: pantry `insert`/`update` stores Zod-validated `input.name` as-is ([pantry.ts:44-48](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L44-L48), [66-68](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L66-L68)). Recipes go through RPC which trims names again ([constrain_units.sql:110](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902165500_constrain_units.sql#L110)).

**Would a library help with units/quantities?**

No for v1 coverage-by-name. Units are already a closed enum (`ml`/`g`/`pcs`); quantity comparison would be domain arithmetic (and both sides may be null), not fuzzy string matching. Fuzzy libs (Fuse, Levenshtein) address typo/near-name matching, not unit conversion or qty sufficiency. PRD/roadmap treat quantity edge cases as iteration risk, not a library requirement ([roadmap.md:125](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/context/foundation/roadmap.md#L125); [prd.md:101-109](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/context/foundation/prd.md#L101-L109)).

**Normalize gap for matching:** stored names keep original case after trim. Overlap without a library still needs **compare-time** `trim`+`toLowerCase` (or equivalent) — that is not done on write today.

### 2. `listRecipes` vs `getRecipe` — selects and round-trips

Constants ([recipe.ts:6-8](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L6-L8)):

- `RECIPE_LIST_SELECT = "id, household_id, title, created_at, updated_at, recipe_ingredients(count)"` — **no ingredient names**.
- `RECIPE_DETAIL_SELECT = "id, household_id, title, steps, created_at, updated_at, recipe_ingredients(id, name, quantity, unit, position, created_at, updated_at)"` — **has names**.

`listRecipes` filters `.eq("household_id", householdId)`, orders `created_at` asc, maps to `ingredient_count` only ([103-115](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L103-L115)).  
`getRecipe` uses detail select + household filter + single row ([117-134](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L117-L134)).  
`listPantryItems` already returns all names in one query ([pantry.ts:23-34](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L23-L34)).

**Round-trips for matching (facts):**

| Approach | Supabase round-trips |
| --- | --- |
| `listPantryItems` + new/extended list with nested `recipe_ingredients(name,...)` | **2** |
| `listPantryItems` + `listRecipes` + `getRecipe` per recipe | **2 + N** |
| SSR page that only has list counts today | insufficient for scoring without extra fetch |

`saveRecipe` already does RPC then `getRecipe` (2 calls) ([136-167](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L136-L167)) — pattern for nested ingredient reload exists; list path does not reuse detail select.

### 3. Existing matching / search / fuzzy / overlap code

- No `matchRecipes`, Fuse, rapidfuzz, or overlap scorer under `src/`.
- `toLowerCase` in app code appears only in `unitSchema` preprocess ([units.ts:22](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/units.ts#L22)).
- `package.json` dependencies: no fuzzy/search/match libraries ([19-41](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/package.json#L19-L41)). Lockfile `damerau-levenshtein` / `fast-levenshtein` are transitive (eslint tooling), not app imports.
- Dashboard is links only — no ranked list UI yet ([dashboard.astro:43-46](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/dashboard.astro#L43-L46)).

### 4. Household scoping / RLS

- Middleware resolves `locals.householdId` from memberships + cookie ([middleware.ts:25-38](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/middleware.ts#L25-L38)); protects `/dashboard`, `/pantry`, `/recipes` ([10](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/middleware.ts#L10)).
- APIs refuse missing household (`400 "No household"`) and pass `locals.householdId` into services — e.g. pantry GET/POST ([api/pantry/index.ts:14-25](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/api/pantry/index.ts#L14-L25), [37-60](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/api/pantry/index.ts#L37-L60)); recipes same ([api/recipes/index.ts:14-25](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/api/recipes/index.ts#L14-L25)).
- Service queries always `.eq("household_id", householdId)` for list/get/mutate.
- RLS: pantry select/insert/update/delete use `is_household_member(household_id)` ([pantry_items.sql:18-41](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902111000_pantry_items.sql#L18-L41)); recipes + `recipe_ingredients` likewise ([recipe_management.sql:34-82](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902151904_recipe_management.sql#L34-L82)).
- `is_household_member` = exists row in `household_members` for `auth.uid()` ([household_data_scaffold.sql:31-44](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260901141851_household_data_scaffold.sql#L31-L44)).
- `recipe_ingredients.household_id` is denormalized for the same RLS style ([recipe_management.sql:18](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/supabase/migrations/20260902151904_recipe_management.sql#L18)).

Matching that only reads via these services/RLS stays per-household by construction; no cross-household catalog exists (PRD non-goal: [prd.md:121](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/context/foundation/prd.md#L121)).

### 5. Scale implications visible in code

- `listPantryItems` / `listRecipes`: no `.range()`, `.limit()`, cursor, or page params — full household list ([pantry.ts:23-28](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L23-L28); [recipe.ts:103-108](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L103-L108)).
- Pages SSR-load the entire list into React islands (`initialItems` / `initialRecipes`) ([pantry.astro:17-40](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/pantry.astro#L17-L40); [recipes/index.astro:17-40](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/recipes/index.astro#L17-L40)).
- Grep of `src` found no pagination helpers for these domains.
- Implication: in-memory overlap over the full household pantry × recipes matches the existing “list all” assumption; a matching library is not required for scale at current code shape.

### 6. PantryManager / RecipeEditor — natural refetch points for a ranked list

**There is no ranked-list state or `/api/matches` today.** Facts about post-mutation hooks:

**PantryManager** (local `items` only today):

- After successful **add**: replaces temp id with `json.data` ([62-63](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L62-L63)).
- After successful **update**: replaces row with `saved` ([108-109](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L108-L109)).
- After successful **remove**: DELETE ok path leaves item removed (optimistic already applied at [120](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L120); success is fall-through after [122-127](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/pantry/PantryManager.tsx#L122-L127)).
- Failure paths roll back `items` and toast — any ranked refetch should only run on success branches above.
- PRD US-02: pantry edit → re-rank ([prd.md:109](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/context/foundation/prd.md#L109)). These three success points are the natural client hooks if the ranked list shares the pantry page or is fetched after pantry mutations.

**RecipeEditor:**

- Create success: `window.location.href = /recipes/${id}` ([150-153](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeEditor.tsx#L150-L153)) — full navigation; ranked list would refresh only if visited later / SSR.
- Update success: rehydrates local drafts from `json.data` ([155-159](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeEditor.tsx#L155-L159)) — no list refetch; natural hook only if a ranked list coexists on that page (it does not today).

**RecipeList:** delete success updates local `recipes` only ([15-23](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/components/recipes/RecipeList.tsx#L15-L23)) — same pattern.

**SSR:** dashboard/pantry/recipes each load once in frontmatter; islands do not remount after API mutations without navigation. Natural server recompute is on next full page load of whatever page hosts the ranked list.

### Answer to the research question

**Yes — overlap ranking can be implemented without a matching library.** Evidence: names are plain strings already available on pantry list + recipe detail (or one nested list query); app has no fuzzy dependency or scorer; household filter + RLS already bound reads; lists are unbounded household-sized (fits in-memory `Set` intersection). A library would only become relevant for typo-tolerant **name** matching later — not for units (`ml`/`g`/`pcs`) or for basic coverage scoring. Compare-time lowercase is required because write path does not case-fold names.

## Follow-up Research 2026-09-03T13:21:30+02:00

**Question:** Review the codebase and decide whether “Do not add a matching library for v1” is a good proposition for implementing S-03.

**Verdict: yes — keep it.** A colocated TypeScript coverage scorer in `src/lib/services/` (Jest-tested, no new npm package) is the approach that fits the live code, archived S-01/S-02 decisions, Cloudflare Workers, and PRD “basic overlap.” A fuzzy/search library would fight those constraints more than it would help rankings.

### What the code actually stores

- Pantry names and recipe ingredient names are independent free-text `string`s, trimmed 1–200 at the API ([`src/lib/pantry-schemas.ts:4-6`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/pantry-schemas.ts#L4-L6), [`src/lib/recipe-schemas.ts:4-7`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/recipe-schemas.ts#L4-L7)). There is no shared ingredient id, catalog, or stemmer.
- Units are already an app-owned enum (`ml` / `g` / `pcs`) in [`src/lib/units.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/units.ts) — the precedent for “small shared helper, not a library.”
- Quantity is optional numeric. Fuse.js / RapidFuzz compare strings; they do not score “2 eggs vs 12 eggs.” If S-03 later cares about quantity, that is another pure function, not a matching package.
- `grep` over `src/` finds no existing fuzzy, Jaccard, Fuse, or overlap matcher. Matching is greenfield.

### Scale and where ranking should run

- `listPantryItems` and `listRecipes` load the **whole household** with no `limit`/`range` ([`src/lib/services/pantry.ts:23-28`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/pantry.ts#L23-L28), [`src/lib/services/recipe.ts:103-108`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L103-L108)). Pantry plan assumed “a few hundred items.” In-memory `Set` intersection is O(recipes × ingredients) and is trivial at that size on a Worker.
- `listRecipes` only fetches `recipe_ingredients(count)` ([`src/lib/services/recipe.ts:6`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/lib/services/recipe.ts#L6)). Matching needs names: one nested select (same shape as `RECIPE_DETAIL_SELECT` without per-recipe N+1), then score in TypeScript. A library does not remove that query.
- S-02 stored ingredients in a child table **so S-03 can join on `name` without a schema rewrite** (`context/archive/2026-09-02-recipe-management/plan-brief.md`). That is a fetch/join choice. Ranking can still live in TS after the join — same as pantry/recipe services today.
- Household filter is already `.eq("household_id", householdId)` plus RLS. Scoring must not bypass `locals.householdId`.

### Conventions a library would fight

- Runtime is Astro SSR on Cloudflare (`astro.config.mjs` `adapter: cloudflare()`, `output: "server"`). `package.json` has no search/NLP/vector deps — only Zod, Supabase, React/UI. Native/WASM fuzzy packages are a Worker risk; a 20-line scorer is not.
- Services are mocked Supabase clients + assertions (`src/lib/services/pantry.test.ts`, `recipe.test.ts`). A pure `matchRecipes(pantry, recipes)` fits that pattern exactly. `lessons.md`: always add Jest with service work — a library without fixtures still needs the same tests for **our** score meaning (coverage, missing names).
- Dashboard after login does not yet show matches ([`src/pages/dashboard.astro:43-46`](https://github.com/MarcinG-DKA/co-na-obiad/blob/4bce2aee456ef1664616ce0a1a3f3b9f288002cd/src/pages/dashboard.astro#L43-L46)). Pantry is a `client:load` island that `fetch`es JSON; US-02 re-rank is refetch/reload, not a search index to invalidate.

### Archived decisions (do not reopen with Fuse.js)

- Pantry: “S-03 uses **case-insensitive overlap**”; free-text + basic cleanup; **ingredient normalization deferred**; noisy matching accepted for MVP (`context/archive/2026-09-02-pantry-management/plan-brief.md`).
- Recipes: free-text names like pantry; “noisy matching accepted until S-03”; catalog/autocomplete/stemming **out of scope** (`context/archive/2026-09-02-recipe-management/plan-brief.md`).
- Roadmap S-02 risk: unnormalized names → noisy S-03 rankings — sequenced as accepted, not as “add Levenshtein.”
- Roadmap S-03: algorithm is PRD overlap scoring; quantities are an **iteration** edge, not v1 library scope.
- PRD non-goal: no AI. Tech stack: overlap as “straightforward server logic.”

A fuzzy library would **mask** the accepted free-text risk (`Eggs` vs `egg` vs `jajka`) instead of making mismatches visible. Case-insensitive exact match after `trim`/`toLowerCase` is what S-01 already promised S-03. Polish pluralization (`pomidor` / `pomidory`) is a later normalization/catalog problem, not a reason to take Fuse.js now.

### When a library would become justified

Only after shipping exact overlap and measuring real mismatches:

1. Same household consistently types near-duplicates (`chicken breast` vs `chicken`) **and** product agrees those should count as one — then consider `rapidfuzz-js` `tokenSetRatio` (pure JS / edge) **or** a tiny synonym map, not Elasticsearch.
2. Household lists grow past “few hundred” **and** TS scoring shows up in Worker time — then a SQL RPC that counts matches, still no JS fuzzy lib.

Neither condition is visible in the current schema, APIs, or pagination (there is none).

### Code references (this follow-up)

- `src/lib/services/pantry.ts:13-34` — `PantryItem.name`; full-list load by household.
- `src/lib/services/recipe.ts:6-8` — list vs detail select; matching needs ingredient names.
- `src/lib/services/recipe.ts:103-134` — `listRecipes` vs `getRecipe`.
- `src/lib/pantry-schemas.ts` / `src/lib/recipe-schemas.ts` — trim, no name catalog.
- `src/lib/units.ts` — in-repo enum helper pattern.
- `src/pages/dashboard.astro:43-46` — household page still a hub, not ranked matches.
- `src/pages/pantry.astro:39-40` — pantry island; mutations are `fetch`, not index updates.
- `package.json:19-41` — no matching/search libraries.
- `astro.config.mjs:11-16` — Cloudflare SSR.
- `context/foundation/lessons.md` — Jest with every new service.
- `context/archive/2026-09-02-pantry-management/plan-brief.md` — case-insensitive overlap; skip normalization.
- `context/archive/2026-09-02-recipe-management/plan-brief.md` — child table for S-03 join; free-text accepted.

### Open questions unchanged

Dashboard vs `/matches`, hide zero-score rows, show missing names, pantry refetch vs navigation — product/plan questions, not library questions.

### Addenda from stack and archive review

- **workerd ≠ Node.** Native addons (`sharp`, `fs`, WASM-heavy fuzzy) fail at SSR request time even if `npm install` succeeds (`context/foundation/infrastructure.md`). `wrangler.jsonc` already sets `nodejs_compat`; that is not a license to add native matching libs. Pure `Set` intersection stays edge-safe.
- **Do not N+1 `getRecipe`.** Infra research already flags sequential Supabase HTTP as the matching latency trap. Matching should be `listPantryItems` + one nested recipes-with-ingredients query (2 round-trips), then score in TS — consistent with the list-vs-detail findings above.
- **Shared DTOs.** S-02 left `src/types.ts` for S-03 if pantry + recipe types need to sit together. Optional; not a reason to add a matching package. Keep scorer inputs as the existing service types until a plan says otherwise.
- **Test shape.** A coverage scorer is `units.test.ts`-style (pure, no Supabase mock). Any `/api/matches` route still needs a mocked-`@/lib/supabase` API suite per `lessons.md`.

