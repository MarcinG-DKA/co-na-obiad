---
project: Co na obiad?
version: 1
status: draft
created: 2026-08-31
updated: 2026-09-04
prd_version: 1
main_goal: speed
top_blocker: time
milestone_id: inventory-first-mvp
milestone_seq: 1
milestone_status: open
---

# Roadmap: Co na obiad?

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Inventory-first MVP** — Status: open

- **Intent:** Deliver the end-to-end inventory-first flow — from login through pantry and recipe management to a ranked recipe list — proving that starting from what's on hand beats browsing a catalog.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001, FR-002, FR-003, FR-004, FR-005, FR-007, FR-008, US-01, US-02, US-03, US-04.

## Vision recap

Home cooks face decision paralysis when they open the fridge — too many possible meals, no clear path from "what's here" to "what to cook." Most recipe apps are browse-first; users scroll catalogs hoping something matches their pantry. Co na obiad? inverts that: start from what's on hand, surface only what the cook can actually make, ranked by ingredient overlap.

## North star

**S-03: Pantry-recipe matching** — the smallest end-to-end slice whose successful delivery proves the core product hypothesis: that inventory-first matching is more useful than catalog browsing. Placed as early as prerequisites allow because the product's value proposition only exists if this works.

> The north star is the smallest end-to-end slice whose successful delivery would prove the core product hypothesis — placed as early as prerequisites allow because everything else only matters if this works.

## At a glance


| ID   | Change ID               | Outcome (user can …)                                    | Prerequisites | PRD refs                              | Status   |
| ---- | ----------------------- | ------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01 | household-data-scaffold | (foundation) household model and RLS isolation in place | —             | US-01, FR-001, NFR-01, Access Control | done     |
| S-01 | pantry-management       | see and edit household pantry contents                  | F-01          | US-02, FR-002, FR-003                 | done     |
| S-02 | recipe-management       | add, edit, and delete recipes with ingredient lists     | F-01          | US-04, FR-005                         | done     |
| S-03 | pantry-recipe-matching  | see recipes ranked by ingredient overlap with pantry    | S-01, S-02    | US-02, FR-004                         | done     |
| S-04 | change-homepage         | use the dashboard at / with a user nav top bar          | F-01          | —                                     | proposed |
| S-05 | stale-pantry-reminder   | see when pantry was last updated and get a 7-day nudge  | S-01, S-04    | US-03, FR-007, FR-008                 | proposed |


## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.


| Stream | Theme             | Chain                    | Note                                                            |
| ------ | ----------------- | ------------------------ | --------------------------------------------------------------- |
| A      | Pantry → matching | `F-01` → `S-01` → `S-03` | Main path to north star; `S-03` also requires `S-02` (joins B). |
| B      | Recipe management | `S-02`                   | Joins Stream A at `S-03`.                                       |
| C      | Homepage          | `S-04`                   | Depends on `F-01`. Sequence before `S-05`.                      |
| D      | Data freshness    | `S-01` → `S-05`          | After `S-04` so the nudge lands on `/`.                         |


## Baseline

What's already in place in the codebase as of 2026-08-31 (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 islands, Tailwind 4, shadcn/ui (button only), file-based routing in `src/pages/`
- **Backend / API:** present — Astro SSR on Cloudflare Workers, 3 auth API routes, middleware; services layer empty
- **Data:** partial — Supabase client wired for auth only; no app tables, migrations, or seed data
- **Auth:** present — Supabase SSR, cookie sessions, middleware guarding `/dashboard`, signin/signup/confirm-email pages
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), CI lint+build (`.github/workflows/ci.yml`); no auto-deploy
- **Observability:** partial — Cloudflare Workers platform logging; no app-level logging, error tracking, or metrics

## Foundations

### F-01: Household data scaffold

- **Outcome:** (foundation) Household model landed in Supabase — `households` and `household_members` tables with RLS policies enforcing per-household data isolation; new users auto-assigned to a household on signup.
- **Change ID:** household-data-scaffold
- **PRD refs:** US-01, FR-001, NFR-01 (household data isolation), Access Control (household sharing)
- **Unlocks:** S-01, S-02, S-03, S-04, S-05
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** If the household membership model is wrong (e.g., one user in multiple households vs. strictly one), downstream slices inherit the mistake. Sequenced first because every vertical slice queries by household.
- **Status:** done

## Slices

### S-01: Pantry management

- **Outcome:** User can see the household pantry contents and add, edit, or remove items.
- **Change ID:** pantry-management
- **PRD refs:** US-02 (pantry edit), FR-002 (see fridge contents), FR-003 (modify fridge contents)
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pantry UX must be fast enough for "standing in front of the fridge" moments; if editing is cumbersome, users won't maintain accurate inventory. Sequenced early because the north star (S-03) and stale-reminder (S-05) both depend on it.
- **Status:** done

### S-02: Recipe management

- **Outcome:** User can add, edit, and delete recipes with ingredient lists in the household library.
- **Change ID:** recipe-management
- **PRD refs:** US-04 (recipe edit), FR-005 (add/delete/modify recipes)
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Ingredient data entry determines matching quality downstream — if ingredient names are free-text with no normalization, S-03's matching will produce noisy rankings. Sequenced parallel with S-01 because both unblock S-03.
- **Status:** done

### S-03: Pantry-recipe matching

- **Outcome:** User sees saved recipes ranked by how well they match the household's current pantry; editing pantry contents re-ranks the list.
- **Change ID:** pantry-recipe-matching
- **PRD refs:** US-02 (pantry edit → matches update), FR-004 (see matching recipes)
- **Prerequisites:** S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — if ingredient-overlap matching produces unhelpful rankings, the core hypothesis fails. The matching algorithm (described in PRD §Business Logic) is straightforward overlap scoring, but edge cases (partial matches, ingredient quantities) may need iteration. Sequenced as early as prerequisites allow.
- **Status:** done

### S-04: Change homepage

- **Outcome:** The dashboard is the homepage at `/` (not the starter landing) and shows the top bar with the signed-in user’s name and navigation.
- **Change ID:** change-homepage
- **PRD refs:** —
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Relocating the household page rewrites routing and `/dashboard` links; do not add `"/"` to `PROTECTED_ROUTES` as a prefix match. Sequence before S-05 so the reminder mounts on `/`.
- **Status:** proposed

### S-05: Stale pantry reminder

- **Outcome:** User sees when the household pantry was last updated; when 7+ days have passed without an edit, a non-blocking reminder encourages a pantry review.
- **Change ID:** stale-pantry-reminder
- **PRD refs:** US-03 (stale pantry reminder), FR-007 (last-updated visibility), FR-008 (7-day nudge)
- **Prerequisites:** S-01, S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Low-risk slice; main concern is that the reminder must be non-blocking (not a modal or hard gate). Sequenced after S-04 because the household page moves to `/`.
- **Status:** proposed

## Backlog Handoff


| Roadmap ID | GitHub | Change ID               | Suggested issue title                    | Ready for `/10x-plan` | Notes                                   |
| ---------- | ------ | ----------------------- | ---------------------------------------- | --------------------- | --------------------------------------- |
| F-01       | #1     | household-data-scaffold | Household data model + RLS policies      | yes                   | Run `/10x-plan household-data-scaffold` |
| S-01       | #2     | pantry-management       | Pantry view and edit                     | no                    | Needs F-01 done first                   |
| S-02       | #3     | recipe-management       | Recipe CRUD with ingredient lists        | no                    | Needs F-01 done first                   |
| S-03       | #4     | pantry-recipe-matching  | Recipe matching ranked by pantry overlap | no                    | Needs S-01 + S-02 done                  |
| S-04       | —      | change-homepage         | Dashboard homepage at / with top bar     | yes                   | F-01 done; no GitHub issue yet          |
| S-05       | #5     | stale-pantry-reminder   | Stale pantry reminder (7-day nudge)      | no                    | Needs S-04 done first                   |


## Open Roadmap Questions

_(None — PRD has no open questions and no cross-cutting unknowns surfaced during the interview.)_

## Parked

- **FR-006: Favorite recipes** — Why parked: nice-to-have priority in PRD; deferred for speed (main goal). Can be picked up after the milestone if time allows. → #6
- **Ingredient substitution suggestions** — Why parked: PRD §Non-Goals, deferred to v2. → #7
- **Shopping list generation** — Why parked: PRD §Non-Goals, deferred to v2. → #8
- **AI/LLM-powered features** — Why parked: PRD §Non-Goals; basic overlap matching only in v1. → #9
- **Public/shared recipe catalog** — Why parked: PRD §Non-Goals; personal/household library only. → #10
- **Multi-day meal planning / calendar** — Why parked: PRD §Non-Goals; MVP solves "what to cook tonight." → #11

## Milestone History

_(Empty — this is the first milestone.)_

## Done

- **F-01: (foundation) Household model landed in Supabase — `households` and `household_members` tables with RLS policies enforcing per-household data isolation; new users auto-assigned to a household on signup.** — Archived 2026-09-02 → `context/archive/2026-09-01-household-data-scaffold/`. Lesson: —.
- **S-01: User can see the household pantry contents and add, edit, or remove items.** — Archived 2026-09-02 → `context/archive/2026-09-02-pantry-management/`. Lesson: —.
- **S-02: User can add, edit, and delete recipes with ingredient lists in the household library.** — Archived 2026-09-02 → `context/archive/2026-09-02-recipe-management/`. Lesson: —.
- **S-03: User sees saved recipes ranked by how well they match the household's current pantry; editing pantry contents re-ranks the list.** — Archived 2026-09-04 → `context/archive/2026-09-03-pantry-recipe-matching/`. Lesson: —.

