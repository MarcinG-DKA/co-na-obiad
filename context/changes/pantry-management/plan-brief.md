# Pantry Management — Plan Brief

> Full plan: `context/changes/pantry-management/plan.md`

## What & Why

Add household pantry CRUD — the first app-domain feature on top of the F-01 household scaffold. Users need to see and edit their household's pantry contents (FR-002, FR-003) so that the downstream matching engine (S-03) has pantry data to work with. Without this slice, the inventory-first product hypothesis can't be tested.

## Starting Point

F-01 landed `households` + `household_members` with RLS via `is_household_member()`, cookie-based household resolution in middleware (`Astro.locals.householdId`), and a service layer pattern. No app-domain tables, no JSON API routes, and no client-side `fetch()` exist yet. All mutations use PRG form POST → redirect.

## Desired End State

A logged-in user navigates to `/pantry` and sees their household's pantry items. They can add (name + optional quantity/unit), edit inline, and remove items — all with instant optimistic updates and toast error feedback. The pantry is fully isolated per household via RLS. A second user in a different household sees only their own pantry.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Data model | Name + optional quantity + optional unit | Enables meaningful pantry state without over-engineering; quantity available for S-03 if needed. |
| Ingredient names | Free-text with basic cleanup | Zero-friction adding is critical for in-kitchen speed; S-03 uses case-insensitive overlap. |
| `updated_at` column | Add now (for S-04) | Avoids a follow-up migration on a populated table; trivial cost. |
| Interaction pattern | React island + fetch + optimistic updates | Directly addresses the "standing in front of the fridge" speed risk; sets the fetch+JSON convention for S-02–S-04. |
| Page location | Dedicated `/pantry` route | Clean separation; room to grow; dashboard stays a hub. |
| Error UX | Inline toast (sonner) | Non-disruptive; user stays in editing flow. |
| RLS approach | Direct per-operation policies | Standard Supabase CRUD; simpler than definer RPCs; appropriate for pantry operations. |
| Isolation proof | Manual SQL verification | No test infrastructure in place; documented queries prove RLS works. |

## Scope

**In scope:**
- `pantry_items` table with RLS, `updated_at` trigger
- Pantry service (`src/lib/services/pantry.ts`)
- JSON API routes (GET, POST, PATCH, DELETE) under `/api/pantry/`
- `/pantry` page with React island, optimistic CRUD, toast errors
- Dashboard + Topbar navigation links
- Cross-household isolation verification

**Out of scope:**
- Recipe management (S-02), pantry-recipe matching (S-03), stale reminder UI (S-04)
- Ingredient normalization / autocomplete
- Categories, expiry dates
- Automated test suite / pgTAP
- Auth route retrofitting

## Architecture / Approach

Vertical CRUD slice across three layers: Supabase schema (migration + RLS) → TypeScript service + JSON API routes → Astro page with React island. The React island receives server-rendered initial data as props and handles mutations via `fetch()` to JSON endpoints with optimistic UI. This introduces the first JSON API convention — responses are `{ data, error }` instead of redirects — which becomes the standard for subsequent slices.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema, RLS, and types | `pantry_items` table, per-operation RLS, `updated_at` trigger, generated types | RLS policies too tight/loose; first real isolation test |
| 2. Service + JSON API | Typed service, 4 API routes returning JSON, Zod validation | New JSON response convention must be clean enough for S-02 to copy |
| 3. Pantry UI | `/pantry` page, React island with optimistic CRUD, toast errors, nav links | Optimistic update edge cases (concurrent edits, stale data) |

**Prerequisites:** F-01 done (households, middleware, `locals.householdId`)
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- Free-text ingredient names may produce noisy S-03 matching — acceptable for MVP; revisit if matching quality is poor.
- No pagination — assumes household pantries stay under a few hundred items.
- Optimistic updates can briefly show stale state if two household members edit simultaneously — acceptable given small household sizes.
- `sonner` toast library adds a dependency; could switch to a simpler inline alert if bundle size matters.

## Success Criteria (Summary)

- Full CRUD cycle works in the browser without page reloads.
- Cross-household isolation proven: User A's items invisible to User B in a different household.
- `npm run lint` + `npm run build` pass with all new code.
