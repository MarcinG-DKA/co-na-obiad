# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-09

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "<the
   team is worried about X, and the failure would surface somewhere in
   <area>>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | Ranked list looks confident but does not match the cook’s pantry/recipe names (wrong order, wrong missing ingredients, zero-overlap hidden, or empty pantry not all-zero) | High | High | PRD Business Logic / FR-004; roadmap S-03 north star; interview Q2, Q3; hot-spot dir `src/lib` (44 file-changes/30d), `src/lib/services` (21) |
| 2 | Authenticated member of household A sees or changes household B’s pantry, recipes, or matches | High | Medium | PRD Guardrails / NFR isolation; archive household scaffold (isolation not proven in F-01); pantry plan (first isolation proof, manual SQL only); interview Q1; hot-spot `src/pages/api` (27) |
| 3 | Middleware stops gating `/`: a guest reaches the household page, or a signed-in cook is bounced through a redirect loop and cannot reach the ranked list | High | Medium | Archive change-homepage (exact `/` vs prefix); interview Q4; hot-spot `src/lib` + middleware churn (8 commits/30d); `src/pages` churn was misleading for this risk |
| 4 | Logged-in user mutates another household’s pantry/recipe by sending a client-chosen id or household id (IDOR) | High | Medium | Abuse lens; pantry/recipe JSON-API plans (id from session, not body); hot-spot `src/pages/api` (27) |
| 5 | Cook edits pantry or a recipe, returns to `/`, and still sees the old ranking | High | Medium | PRD US-02 / US-04; matching plan (re-rank on next show, not on `/pantry`); hot-spot `src/components` (31) |
| 6 | Freshness line lies: empty pantry shows the 7-day nudge, or a pantry older than 7×24h does not, so the cook trusts or ignores matches for the wrong reason | Medium | Medium | PRD US-03 / FR-007 / FR-008; roadmap S-05 just shipped |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Given pantry and recipe ingredient lists (independent fixtures), order/scores/missing names match unique-name coverage; empty pantry → all scores 0; zero-overlap at bottom; name-only overlap is not a full match when units or amounts disagree (Check / insufficient qty) | Green existing tests mean the ranking is still the product contract | Ranking entry (SSR + list API), normalize rule, unique-name denominator, empty pantry vs empty library, Check at half credit, qty/unit sufficiency | Unit with independent fixtures (scorer already exists) | Oracle copied from the scorer implementation |
| #2 | Member of A cannot read or write B’s pantry, recipes, or matches | Logged-in ⇒ allowed; “RLS enabled” ⇒ isolated; 401 on missing session ⇒ ownership works | How current household is chosen; API household source; RLS vs app check; join path | API/service integration with two-user fixtures | Happy-path-only as household A |
| #3 | Signed-out `/` is redirected before the household page runs; `/auth/signin` is not looped; signed-in session reaches the ranked list | Path-helper unit tests imply cookie session + middleware work | Session cookie shape, middleware order, exact `/` vs prefix, sign-out landing; guest matches also require a household id | Path-helper unit (exists) + Vitest on `shouldRedirectUnauthenticated` (not e2e) | Full-app Playwright suite for every page |
| #4 | PUT/PATCH/DELETE with another household’s resource id is 403/404; create ignores a client-supplied household id | 401 unauthenticated ⇒ IDOR is covered | Resource id source, household id source, RLS vs handler | API integration, two households | Mock the service so the handler never sees a foreign id |
| #5 | After a pantry/recipe write, the next ranked-list load (SSR or on-screen refetch) shows new scores/missing names | First-paint SSR ⇒ US-02; refetch HTTP 200 ⇒ ranking changed | When matches reload, list API vs pantry page, visibility/pageshow | Service/API integration after a write; e2e only if the island refetch is the failure | Kitchen-flow e2e when list-after-write would catch it |
| #6 | Empty pantry: no 7-day nudge. Oldest item ≥ 168h: nudge. Under 168h: no nudge. Load error ≠ empty | Any `updated_at` ⇒ reminder is correct; deleting a fresh row clears the nudge | MIN vs MAX, injected `now`, empty vs load error | Unit (already present) — only add what research shows is missing | Snapshot of English copy as the only assertion |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|---------------|------------|--------|---------------|
| 1 | Critical-path coverage | Prove matching contract with an independent oracle, and that `/` is session-gated | #1, #3 | unit + one session-level test | complete | testing-critical-path-coverage |
| 2 | Isolation around APIs | Prove two-household isolation/IDOR and that writes re-rank the list | #2, #4, #5 | integration | complete | testing-isolation-around-apis |
| 3 | Freshness + quality floor | Close remaining freshness gaps; lock CI lint/test/build as the floor; fill cookbook §6 | #6 + cross-cutting | unit (gap-fill) + gates | not started | — |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.
Recommendations in this section must be grounded in local manifests/configs
plus the MCP/tools actually exposed in the current session. If a useful docs
or search MCP such as Context7 or Exa.ai is not available, say that instead
of assuming access.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration | Vitest | 5.x | `vitest.config.ts` (Vite `defineConfig`, not Astro `getViteConfig`); `environment: node`; colocated `src/**/*.test.ts`; 13 files (sparse; cluster in services/schemas/API) |
| API mocking | `vi.mock` of `@/lib/supabase` | n/a | Existing convention: never load `astro:env` in API tests |
| e2e | none yet — see §3 Phase 1 | — | Astro docs: Playwright for e2e. Use only if research shows the path-helper cannot see the cookie session (Risk #3) |
| accessibility | none yet | — | Not a top-N risk; do not add in this rollout |
| Workers runtime tests | not in use | — | Cloudflare Vitest pool/Miniflare is a separate later layer; unit tests stay on node |
| (optional) AI-native | none this rollout — checked: 2026-09-07 | n/a | When NOT to use: vision/hooks on ranking, isolation, or freshness — deterministic fixtures already give the signal |

**Test-base profile:** sparse — Vitest configured, 13 test files, clustered in `src/lib` + `src/pages/api`; React islands, RLS, and session e2e are bare.

**Stack grounding tools (current session):**
- Docs: Context7 — Vitest 5 config/globals/`vi.mock`; Astro testing (`getViteConfig` not used — lightweight Vite config chosen); checked: 2026-09-08
- Search: Exa.ai — Vitest CLI `related --run` + Astro testing page; checked: 2026-09-08
- Runtime/browser: Playwright MCP / browser MCP — not used for this runner swap; checked: 2026-09-08
- Provider/platform: Cloudflare Workers Vitest pool not adopted; GitHub MCP not in session; checked: 2026-09-08

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase \<N\>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI (`npm run lint`, `npm run build`) | required | syntactic / type drift |
| unit + integration | local + CI (`npm test`) | required | logic regressions; Phase 1–2 add independent-oracle and isolation cases |
| e2e / session-level on `/` access | CI on PR | required after §3 Phase 1 | guest sees household page; signed-in redirect loop (Risk #3) — only if Phase 1 research chooses a session-level test |
| CI floor lock | CI | required after §3 Phase 3 | lint + test + build stay the merge bar; no new YAML in this guide |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase \<N\>."

### 6.1 Adding a unit test

- **Location**: colocated `*.test.ts` next to the module (`src/lib/services/matching.test.ts` for ranking).
- **Naming**: `<module>.test.ts`. Use `describe` for the function (`matchRecipes`) and `it` for one behaviour.
- **Fixtures**: hand-built pantry/recipe **names** (and qty/unit only when the case is about Check/qty). Expected order, scores, and name lists are written from the product contract, not pasted from scorer internals.
- **Reference tests**: omelette-vs-cake unique-name ranking; full/partial/zero-overlap order (zero-overlap last, score `0`); recipe `"Eggs"` + pantry `"eggs"` keeps `"Eggs"` in `matchedNames`.
- **Product law**: live Check/qty scoring (half credit for Check; insufficient qty is Missing). Do not assert archived “quantities ignored.”
- **Anti-pattern**: do not mock `listMatches` in API tests and treat that as a ranking oracle. API tests cover the envelope; ranking math lives in the scorer suite.
- **Run locally**: `npm test`

### 6.2 Adding an integration test

- **Location**: store-backed cases colocated with the service (`pantry.test.ts`,
  `recipe.test.ts`). `listMatches` isolation and list-after-write live in
  `matching-store.test.ts` — not `matching.test.ts`, which mocks the loaders.
  Unmocked pantry PATCH wiring: `pantry-idor-api.test.ts`. Current household:
  `household.test.ts`.
- **Fake**: `src/test/supabase-fake.ts` (`createSupabaseFake`). Sequential `eq`
  is AND on in-memory rows. This is not RLS and does not run Postgres.
- **Cookie / current household**: `resolveHouseholdId` uses a
  `current_household_id` cookie only if it is a membership. Join is allowed
  (cookie B + memberships A and B → B). Isolation is non-member of B, not
  “any second household.”
- **Isolation**: seed both `hh-A` and `hh-B` in one store. A’s list/get omit
  B’s rows; `listMatches(A)` recipe titles do not include B’s.
- **IDOR**: foreign id as A is **404**, not 403; B’s row remains. There is no
  PUT. Do not mock the service for the foreign-id case.
- **List-after-write (US-02)**: two `listMatches` calls on the same store
  (before and after `addPantryItem` / `saveRecipe`). Assert score and/or
  `missingNames` changed. Do not use Playwright; do not mock `listMatches`.
- **Anti-pattern**: happy-path-only as household A; a test named “RLS”;
  mocked-service 404 as ownership; kitchen-flow e2e for re-rank.
- **Run locally**: `npm test`

### 6.3 Adding a session-level / e2e test

- **Location**: colocated `src/lib/protected-routes.test.ts` (same module as `isProtectedPath`).
- **Pattern**: session-level proof is Vitest on `shouldRedirectUnauthenticated(pathname, user)`, not a browser tour. Middleware must call that helper for the unauthenticated redirect.
- **Cases to prove**: guest `/` → redirect (true); `/auth/signin` with no user → no redirect (false); signed-in `/` → no redirect (false).
- **Run locally**: `npm test` (already in CI). No new workflow YAML for this layer.
- **When NOT to use Playwright / a page tour**: do not add e2e for `/` gating while this helper is the control. Reach for Playwright later only if a risk is real cookies or the Workers runtime, after this suite is still green.
- **Anti-pattern**: importing `src/middleware.ts` in Vitest (`astro:middleware` / `astro:env`); a full-app Playwright suite for every page.

### 6.4 Adding a test for a new API endpoint

- **Location**: colocated `*-api.test.ts` next to the route
  (`src/pages/api/pantry/pantry-api.test.ts`).
- **Mock**: `vi.mock("@/lib/supabase")` so `astro:env` never loads. Inject
  `locals.user` and `locals.householdId` on a hand-built `APIContext` —
  middleware is bypassed.
- **Body**: validate with Zod. Household comes from locals, never the body.
  Extra-key POST `{ name, household_id }` must still call the service with
  the locals household and a payload without `household_id`.
- **Envelope vs ownership**: 401 / 400 / envelope 404 stay mocked-service.
  **Ownership / IDOR** uses `createSupabaseFake` and does **not** mock the
  service (`pantry-idor-api.test.ts`). Never trust a client household id.
  Foreign id is 404, not 403.
- **Anti-pattern**: 401 unauthenticated as an IDOR proof; mocking the service
  so the handler never sees a foreign id; importing `src/middleware.ts`.
- **Run locally**: `npm test`

### 6.5 Adding a freshness / date-threshold test

TBD — see §3 Phase 3 for empty vs stale vs load-error (Risk #6); elapsed 168h, injected `now`.

### 6.6 Per-rollout-phase notes

- **§3 Phase 1 (`testing-critical-path-coverage`)**: matching oracle gaps live in `matching.test.ts`; `/` session gate is `shouldRedirectUnauthenticated` in `protected-routes.test.ts`, not Playwright.
- **§3 Phase 2 (`testing-isolation-around-apis`)**: isolation/IDOR/re-rank use `src/test/supabase-fake.ts`; cookie must be a membership; foreign id is 404; list-after-write is `listMatches`, not Playwright.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **shadcn/ui primitives and visual styling** — they churn and catch little product signal. Re-evaluate if a visual bug is a top-3 user-facing failure. (Source: Phase 2 interview Q5.)
- **Parked v2: favorites, ingredient substitution, shopping list, AI/LLM features** — not in the MVP contract. Re-evaluate when a parked item is pulled into the roadmap. (Source: Phase 2 interview Q5; PRD Non-Goals; roadmap Parked.)
- **Dedicated AI-native / vision review layer** — deterministic fixtures cover ranking, isolation, and freshness cheaper. Re-evaluate if a DOM-unreachable surface becomes a top risk. (Source: seed brief cost × signal; no Playwright MCP in session.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-07
- Stack versions last verified: 2026-09-08
- AI-native tool references last verified: 2026-09-08

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
