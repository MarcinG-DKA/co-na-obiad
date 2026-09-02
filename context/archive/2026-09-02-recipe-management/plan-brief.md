# Recipe Management — Plan Brief

> Full plan: `context/changes/recipe-management/plan.md`

## What & Why

Household members need a real recipe library — add, edit, and delete recipes with ingredient lists (US-04, FR-005) — so S-03 can rank by pantry overlap. This slice is the library and editor only; matching UI stays in S-03.

## Starting Point

Pantry CRUD is done: household-scoped RLS, JSON APIs, SSR + React island, Jest. There are no recipe tables, routes, or tests. The JS client cannot run SQL transactions, so nested replace-all cannot be two PostgREST calls.

## Desired End State

A signed-in member opens `/recipes`, creates a recipe on `/recipes/new` (title, ≥1 ingredient, optional ordered steps), edits it on `/recipes/:id` with one Save, and deletes from the list after confirm. Another household sees none of that data. S-03 can join `recipe_ingredients.name` to pantry names without a migration.

## Key Decisions Made

| Decision              | Choice                                      | Why                                                                                          | Source |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Ingredient storage    | Child table `recipe_ingredients`            | S-03 can SQL-join; JSON would force a rewrite                                                | Plan   |
| Ingredient names      | Free-text, trimmed (like pantry)            | Fast entry; noisy matching accepted until S-03                                               | Plan   |
| Recipe fields         | Title + ingredients + ordered steps         | Cookable library without servings/time                                                       | Plan   |
| Editor UX             | `/recipes` list + `/recipes/new` + `/:id`   | Room for a nested form; static `new` wins over `[id]`                                        | Plan   |
| Empty recipes         | At least one ingredient                     | Every stored recipe is matching-ready                                                        | Plan   |
| Steps shape           | `text[]` on `recipes`                       | Order without a third table; matching does not query steps                                   | Plan   |
| Nested writes         | Replace-all via `save_recipe` RPC           | One Save, consistent snapshot; JS has no transaction                                         | Plan   |
| Tests                 | Jest schema + service + API                 | lessons.md; no RTL/Playwright in this slice                                                  | Plan   |
| Normal CRUD vs RPC    | RLS for read/delete; RPC only for save      | Avoid DEFINER for ordinary rows; copy `join_household` grants for the atomic boundary        | Plan   |

## Scope

**In scope:** Schema + RLS + `save_recipe`; JSON API; Jest; `/recipes` list and editor; nav + `PROTECTED_ROUTES`; pantry-grade 404 / confirm / load-error behavior.

**Out of scope:** Matching UI, ingredient catalog/autocomplete, favorites, photos, per-line ingredient APIs, drafts, drag-and-drop, `src/types.ts`.

## Architecture / Approach

`recipes` (title, `steps text[]`) and `recipe_ingredients` (name, optional qty/unit, `position`, denormalized `household_id`). List/get/delete use table RLS like pantry. Create/update: API validates with Zod, calls `save_recipe` with `Astro.locals.householdId`, reloads the recipe. UI: list island for optimistic delete; editor island with explicit Save.

## Phases at a Glance

| Phase | What it delivers                         | Key risk                                      |
| ----- | ---------------------------------------- | --------------------------------------------- |
| 1. Schema, RLS, and save RPC | Tables, policies, atomic RPC, generated types | RPC grants/membership check wrong → data leak or failed saves |
| 2. Service, JSON API, Jest   | CRUD HTTP + CI coverage for nested save  | 0-row delete or empty-ingredient slip past tests |
| 3. Recipes UI                | List + new/detail editor + nav           | `/recipes/new` colliding with `[id]`; load error vs empty |

**Prerequisites:** F-01 household scaffold + S-01 pantry patterns; linked Supabase for `db push` / `db:types`.
**Estimated effort:** ~2–3 sessions across 3 phases (same shape as pantry, plus RPC + nested editor).

## Open Risks & Assumptions

- Free-text names will produce noisy S-03 rankings (roadmap risk, accepted).
- Concurrent editors last-write-wins the whole ingredient list.
- `household_id` on ingredients stays in sync because recipes never move households; RPC copies it from the parent row.

## Success Criteria (Summary)

- Member can create, edit (replace-all ingredients + steps), and delete household recipes in the browser.
- Zero-ingredient saves are rejected; missing recipes/deletes are 404; load failures are not an empty library.
- `npm test` / lint / build pass; SQL isolation holds across households.
