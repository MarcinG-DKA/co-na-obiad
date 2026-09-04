# Pantry-Recipe Matching — Plan Brief

> Full plan: `context/changes/pantry-recipe-matching/plan.md`
> Research: `context/changes/pantry-recipe-matching/research.md`

## What & Why

Ship S-03: after login, the cook sees household recipes ranked by how well they overlap the current pantry, and pantry edits re-rank that list the next time it is on screen. This is the inventory-first north star (US-02, FR-004) — without it the app is just a pantry plus a recipe binder.

## Starting Point

Pantry and recipe CRUD already persist free-text names (trim only, no catalog). `listRecipes` returns ingredient **counts**, not names. Dashboard is a hub; sign-in lands on Welcome (`/`). There is no scorer and no `/api/matches`.

## Desired End State

`/dashboard` is the ranked list: each row shows a percent score and missing ingredient names, including zero-overlap recipes at the bottom. Empty pantry still lists every recipe at 0%; empty library shows a CTA to add a recipe. `GET /api/matches` is the JSON source of truth. Password sign-in redirects to `/dashboard`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Algorithm / library | TypeScript coverage scorer, no npm matching lib | Household lists fit in-memory `Set` intersection; fuzzy libs would hide the accepted free-text noise | Research |
| Name match | trim + lowercase exact; ignore qty/unit | Write path does not case-fold; quantity is an iteration edge | Research |
| Data load | `listPantryItems` + one nested recipes-with-names query (parallel) | Avoid N+1 `getRecipe`; PostgREST cannot sort nested rows by match count | Research |
| List placement | `/dashboard` (keep `/pantry` and `/recipes`) | PRD household page after login; S-01/S-02 already split editors onto their own routes | Plan |
| Zero-score rows | Show at bottom | Binary hide-unmatched drops almost-cookable recipes | Plan |
| Card contents | Rounded percent + missing names | Explainable “what’s missing” is why scores stay simple | Plan |
| Empty pantry / library | Always rank; empty pantry → all 0%; empty recipes → CTA | Ranking remains the product even with an empty fridge | Plan |
| Re-rank | `GET /api/matches` when the list is on-screen; else next dashboard visit | No realtime; list is not mounted on `/pantry` | Plan |
| Post-login | Sign-in → `/dashboard` | PRD: ranked list after login | Plan |
| Coverage set | Unique normalized names (empty recipe → score 0) | Duplicate ingredient rows must not distort `Set` intersection | Plan |

## Scope

**In scope:** `matchRecipes` / `listMatches`, `listRecipesWithIngredients`, `GET /api/matches`, dashboard island, sign-in redirect, Jest for scorer + loader + API.

**Out of scope:** Fuzzy/search/vector/LLM, SQL rank RPC, quantity matching, `/matches` route, ranked list on `/pantry`, `src/types.ts`, hiding zeros, matched-name lists on cards, S-04 reminder.

## Architecture / Approach

Worker loads household pantry and recipes-with-names (two parallel Supabase reads), scores in `src/lib/services/matching.ts`, returns `{ recipeId, title, score, matchedNames, missingNames }`. Dashboard SSR seeds `MatchList`; the island refetches `/api/matches` on `pageshow` / visibility so back-from-pantry is not stale. RLS + `locals.householdId` unchanged.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Scorer + loader | Pure coverage function, nested recipe list, `listMatches`, Jest | Wrong denominator (row count vs unique names) quietly ruins ranks |
| 2. GET /api/matches | Auth/household JSON envelope + API tests | Skipping the supabase mock would load `astro:env` in Jest |
| 3. Dashboard + redirect | Ranked UI, empty states, sign-in → `/dashboard`, on-screen refetch | bfcache leaving stale ranks if refetch is omitted |

**Prerequisites:** S-01 and S-02 done (pantry + recipes with ingredient names in DB).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- Free-text names stay noisy (`egg` vs `eggs`, PL plurals); that is accepted, not fixed here.
- US-02 is “correct when the dashboard list is shown,” not live updates on `/pantry`.
- Unbounded household lists stay in memory; SQL ranking is a later escape hatch if lists grow.

## Success Criteria (Summary)

- After sign-in, `/dashboard` shows recipes ordered by pantry overlap with percent + missing names.
- Editing pantry (then returning to dashboard) changes rank and missing lists.
- Empty pantry and zero-overlap recipes remain visible; an empty library shows a clear add-recipe CTA.
