# Freshness + quality floor Implementation Plan

## Overview

Close test-plan rollout Phase 3: prove the household 7-day nudge on `/` is driven by the **oldest** pantry `updated_at` (MIN), not the newest edit; prove a load failure is not treated as an empty pantry; leave lint + test + build as the merge bar in the **existing** `.github/workflows/ci.yml` (no new YAML); fill cookbook §6.5 / §6.6 and stop agent rules from teaching lint+build on `master`.

## Current State Analysis

Risk #6 is a shipped S-05 control, not a missing product safeguard. Homepage SSR seeds `getPantryLastUpdatedAt` into `PantryFreshness` with a separate `loadError` flag. The island evaluates elapsed milliseconds against `STALE_AFTER_MS` (7×24h, inclusive `>=`) and gates the inaccuracy line on `isStale`. Empty is `lastUpdatedAt === null` **after a successful load** (`isStale: false`, no nudge). Load failure is `loadError === true`; the island returns the error paragraph and never calls `evaluatePantryFreshness`. Live household freshness is **MIN(`updated_at`)**: `order updated_at ascending`, `limit(1)`, `maybeSingle()`. DELETE does not bump survivors; the next read re-computes MIN among remaining rows.

`evaluatePantryFreshness` already has injected-`now` tests for empty / under 168h / exactly 168h / 8d / future. Copy formatters snapshot English; those are **not** the staleness oracle. `getPantryLastUpdatedAt` has a hand-rolled query-shape mock (including empty → `null` and throw-on-error) that **echoes a single timestamp** and therefore cannot see MIN vs MAX. `GET /api/pantry/freshness` tests mock the service and overclaim “oldest.” Item-level `/pantry` review copy is already unit-tested and is a **different product** (no household nudge on that page).

`createSupabaseFake` already sorts pantry rows and supports `removePantryItem`. It has **no** `.limit()` / `.maybeSingle()`. Aliasing `maybeSingle` to `single()` would make empty pantry look like a load error (`toSingle([])` → PGRST116). Without `limit(1)`, `maybeSingle` on two mixed-age rows would also error. Extending the fake is the prerequisite for a real MIN + delete-recompute proof.

CI is already one job: `npm run lint` → `npm test` (`vitest run`) → `npm run build` on push/PR to **`main`**. There is no second workflow. `astro build` does not typecheck. Local lefthook (related Vitest + `tsc --noEmit`) is not the CI floor. `CLAUDE.md` and the AGENTS.md PR paragraph still say lint+build on `master`. Cookbook §6.5 is TBD; §6.6 has Phase 1–2 notes only.

Hot-spot `src/` is empty likelihood evidence for #6. Failure lives in a narrow cluster (`pantry-freshness.ts`, `getPantryLastUpdatedAt`, `PantryFreshness`, `index.astro` seed). Do not scan all of `src/` for new suites.

## Desired End State

`npm test` fails if mixed-age pantry returns the newer `updated_at`, if deleting a fresher row changes MIN, if deleting the stalest (or last) row does not, if `loadError` + `null` is classified as empty or shows the nudge, or if a successful empty load shows the nudge. Cookbook §6.5 names injected `now`, boolean oracles, MIN, and empty-vs-error. §6.6 names the three existing CI `run:` lines and forbids a second workflow. Agent CI sentences match `main` + lint + test + build.

**Verification:** `npm test` and `npm run lint` pass; the cases below exist; §6.5 is no longer TBD; `.github/workflows/` still contains only `ci.yml`.

### Key Discoveries:

- Household contract is MIN, not MAX — `src/lib/services/pantry.ts:37-51`; S-05 addendum in `context/archive/2026-09-07-stale-pantry-reminder/plan.md`.
- `evaluatePantryFreshness` cannot see `loadError`; `null` is empty only when the caller already decided the load succeeded — `src/lib/pantry-freshness.ts:18-27` vs `src/components/pantry/PantryFreshness.tsx:65-67`.
- `STALE_AFTER_MS` is elapsed ms, inclusive `>=` at exactly 168h; helpers inject `now`; the island uses `new Date()` at render — `src/lib/pantry-freshness.ts:1,18-27`, `PantryFreshness.tsx:69`.
- Fake `toSingle([])` is PGRST116; PostgREST `maybeSingle` on 0 rows is `{ data: null, error: null }` — `src/test/supabase-fake.ts:289-294`.
- CI already runs `npm test`; “lock the floor” is not adding a step or a second YAML — `.github/workflows/ci.yml:20-24`.
- Agent-rule drift: `CLAUDE.md:54-56` and `AGENTS.md:39` say lint+build / `master`. Testing paragraph in AGENTS.md is already correct.

## What We're NOT Doing

- Playwright, jsdom, `@testing-library/react`, `*.test.tsx`, or importing `src/pages/index.astro` (`astro:env`).
- Treating English copy snapshots as the staleness / nudge oracle (existing formatter tests stay; do not add more for #6).
- Treating the mocked-service “oldest” case or `freshness-api.test.ts` echo as MIN proof.
- Kitchen-flow e2e; item-level `/pantry` UI tour; expanding `formatPantryItemNeedsReview` tests.
- Island `pageshow` / `visibilitychange` keep-last-good refetch as the loadError≠empty prove (failed refetch keeps last good SSR value; it does not flip success → empty).
- Clock-sync e2e for SSR vs client disagreement at the exact 168h boundary (archive accepted seconds-level skew).
- Re-testing empty / under / exactly-168h elapsed math already in `evaluatePantryFreshness` (view tests compose that function; they do not copy the threshold).
- Adding `npm test` to CI (already present); adding `ci-tests.yml` or any second workflow; a grep-test of `ci.yml`.
- Adding `astro check` / `tsc` to GitHub Actions in this change; GitHub required status checks (repo setting).
- Rewriting test-plan §1–§5 (including §4 file count and §5 “build typechecks”); backporting Risk #6 Must-challenge wording (defer to `/10x-test-plan` / `--refresh`).
- Rewriting `lessons.md` Jest heading; rewriting CLAUDE/AGENTS husky vs lefthook lines (only CI merge-bar sentences).
- Cloudflare Workers Vitest pool; AI-native / vision layer (none this phase — checked: 2026-09-09).

## Implementation Approach

Cost × signal, then remaining #6 gaps, then the floor.

1. **View helper (cheapest remaining prove-column cell).** `evaluatePantryFreshness(null)` is the empty case, not the error case. Extract a pure function next to it that takes `loadError`, short-circuits before evaluate, and returns `{ kind, showNudge }`. Wire `PantryFreshness` to it. Unit-test booleans with injected `now`.
2. **Fake `limit` + `maybeSingle`, then MIN/delete on the same store.** Keep the query-shape mock. Assert mixed ages → older ISO; delete stalest → remaining; delete fresher → MIN unchanged; delete last → `null`. Seed a foreign older row so MIN is household-scoped.
3. **Truth-telling.** Fill §6.5 / §6.6 from what shipped. Align CLAUDE.md + AGENTS.md CI sentences. Do not touch YAML.

## Critical Implementation Details

### `maybeSingle` is not `single`

`toSingle([])` returns PGRST116. PostgREST `maybeSingle` on 0 rows returns `{ data: null, error: null }` — that is how `getPantryLastUpdatedAt` becomes `null` rather than a thrown load error. Implement `.maybeSingle()` as its own terminator. Apply `.limit(n)` **after** filter+sort and **before** `single` / `maybeSingle` / list return. Two rows without `limit(1)` must still be PGRST116 on `maybeSingle` (same as live PostgREST). Do **not** change `.single()` empty behavior; existing update-not-found tests depend on PGRST116.

### View helper must not copy the clock

`resolvePantryFreshnessView` (name may match this contract) short-circuits `loadError === true` → `{ kind: "error", showNudge: false }` **without** calling `evaluatePantryFreshness`. Otherwise it calls `evaluatePantryFreshness(lastUpdatedAt, now)` and maps `isEmpty` → `{ kind: "empty", showNudge: false }`, else `{ kind: "ok", showNudge: freshness.isStale }`. Re-implementing `elapsedMs >= STALE_AFTER_MS` in the helper is an implementation mirror. `PantryFreshness` must call this helper for error vs empty vs nudge; an unused extract is a false proof. Formatters stay responsible for English.

---

## Phase 1: Load error is not empty

### Overview

Cheapest remaining Risk #6 prove: `loadError` + `null` is not the empty pantry path and does not show the 7-day nudge. Empty / 168h / under elapsed math stay in the existing `evaluatePantryFreshness` suite.

- **Behavior asserted:** `loadError` true + `lastUpdatedAt` null → `kind: "error"`, `showNudge: false` (not empty). Successful load + null → `kind: "empty"`, `showNudge: false`. Successful load + oldest ≥ 168h → `kind: "ok"`, `showNudge: true`. Successful load + oldest under 168h → `kind: "ok"`, `showNudge: false`. `loadError` true wins even if a stale ISO is also passed (`kind: "error"`, `showNudge: false`).
- **Regression caught:** Treating helper-null as the load-error case; missing-Supabase / rejected `getPantryLastUpdatedAt` rendering “Pantry is empty.” or the inaccuracy nudge (plan-review F1 / lessons: DB errors looking like empty lists).
- **Research source:** `context/changes/testing-freshness-quality-floor/research.md` Risk #6 (“Load error ≠ empty”, cheapest extra test #2); `PantryFreshness.tsx:65-67`; `index.astro:43-50`; `pantry-freshness.ts:18-27`.
- **Edge/boundary:** Error short-circuit vs empty-null (same `lastUpdatedAt`, different `loadError`). Inclusive 168h is **not** re-proven here — `showNudge` on the ok path is `evaluatePantryFreshness(…).isStale` with the same injected `NOW` as the existing suite. Error + stale ISO is the “error wins” boundary (SSR currently seeds error with null; the helper still must not evaluate).
- **Anti-pattern avoided:** English copy as the only assertion; jsdom/RTL; importing `index.astro`; a helper that copies `STALE_AFTER_MS` math; extracting a function the island never calls; testing keep-last-good refetch as this prove.

### Changes Required:

#### 1. View helper on the freshness module

**File**: `src/lib/pantry-freshness.ts`

**Intent**: Give the island a pure decision table that can see `loadError`, so `null` is empty only after a successful load.

**Contract**: Export a function (recommended name `resolvePantryFreshnessView`) with inputs `lastUpdatedAt: string | null`, `loadError: boolean`, `now: Date` and result `{ kind: "error" | "empty" | "ok"; showNudge: boolean }`. `loadError === true` returns `{ kind: "error", showNudge: false }` without calling `evaluatePantryFreshness`. Otherwise map that function’s `isEmpty` / `isStale` as specified above. Do not add copy strings to the result.

#### 2. Boolean suite (injected `now`)

**File**: `src/lib/pantry-freshness.test.ts`

**Intent**: Lock the decision table with the same `NOW` / `at()` style as `evaluatePantryFreshness` tests.

**Contract**: New `describe` for the view helper. Cases: (1) `loadError: true`, `lastUpdatedAt: null` → error / no nudge; (2) `loadError: false`, `null` → empty / no nudge; (3) `loadError: true` + ISO at exactly `-STALE_AFTER_MS` → error / no nudge; (4) `loadError: false` + that stale ISO → ok / nudge; (5) `loadError: false` + ISO at `-(STALE_AFTER_MS - 1h)` → ok / no nudge. Assert `kind` and `showNudge` only. Do not add formatter snapshots. Do not import React, `PantryFreshness.tsx`, or `index.astro`.

#### 3. Island wiring

**File**: `src/components/pantry/PantryFreshness.tsx`

**Intent**: Make the extract the live control so the suite is not a dead helper.

**Contract**: Call the view helper with `hasLoadError`, `lastUpdatedAt`, and the render `Date`. `kind === "error"` keeps the existing error paragraph. Otherwise keep `formatPantryLastUpdated` for the last-updated line and gate the inaccuracy block on `showNudge` (not a parallel `evaluatePantryFreshness(…).isStale` that ignores the helper). Do not add a component test file.

### Success Criteria:

#### Automated Verification:

- `src/lib/pantry-freshness.test.ts` asserts the five view-helper cases (`kind` + `showNudge` only)
- `src/lib/pantry-freshness.ts` exports the helper; `PantryFreshness.tsx` calls it for error vs empty vs nudge
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Helper tests do not snapshot nudge / empty / error English as the oracle
- `PantryFreshness.tsx` does not call `evaluatePantryFreshness` on the `loadError` path
- No jsdom, Playwright, or `index.astro` import was added

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: MIN freshness and reframed delete

### Overview

Lock the challenge the test plan was right to keep (any `updated_at` is **not** enough) and the challenge it misstated (deleting a **fresher** row does not clear the household nudge). Prerequisite: teach the shared fake `limit` + `maybeSingle` without breaking `.single()` / IDOR / list-after-write suites.

- **Behavior asserted:** Two A-rows (older + newer `updated_at`) → `getPantryLastUpdatedAt(A)` is the older ISO. A foreign row older than both does not win. `removePantryItem` the stalest A-row → remaining (newer) ISO. `removePantryItem` the fresher A-row → older ISO unchanged. `removePantryItem` the last A-row → `null`. Empty pantry via the fake is `null`, not a thrown PGRST116.
- **Regression caught:** Flipping the query to `ascending: false` / MAX; treating any update as “the pantry is fresh”; delete that bumps or ignores survivors incorrectly; aliasing `maybeSingle` to `single()` so empty looks like a 500.
- **Research source:** `research.md` Risk #6 (MIN query `pantry.ts:37-51`; fake blocker; cheapest extra test #1; reframed delete table); `supabase-fake.ts` sort already exists, `limit` / `maybeSingle` do not.
- **Edge/boundary:** Mixed ages in **one** household (MIN vs MAX). Foreign older row (household `eq`, not table-wide MIN). Delete stalest vs delete fresher (opposite nudge outcomes). Delete last → empty (`null`), not error. `maybeSingle` on 0 rows ≠ `single` on 0 rows.
- **Anti-pattern avoided:** Mocked-service “oldest” as MIN proof; replacing the query-shape mock; Playwright; asserting English; testing fake internals (`sortPantry`) instead of `getPantryLastUpdatedAt` output; “deleting a fresh row clears the nudge” as the scenario.

### Changes Required:

#### 1. Fake PostgREST bits the MIN query actually calls

**File**: `src/test/supabase-fake.ts`

**Intent**: Let `getPantryLastUpdatedAt` run against the same in-memory store that already supports delete and `updated_at` order.

**Contract**: Query builder gains `.limit(n)` (slice after filter+sort) and `.maybeSingle()` (Promise). `maybeSingle`: 0 rows → `{ data: null, error: null }`; 1 row → `{ data, error: null }`; 2+ rows → existing PGRST116 `NO_ROWS`. `.single()` / `toSingle` stay 0-or-many → PGRST116. Apply `limit` on pantry **and** recipe execute paths so the builder is not pantry-special. Existing `listPantryItems` / IDOR / `matching-store` chains do not call these methods and must keep passing.

#### 2. Store-backed MIN + delete describe

**File**: `src/lib/services/pantry.test.ts`

**Intent**: Prove oldest-wins and the reframed delete story on one fake store per case.

**Contract**: New `describe` using `createSupabaseFake` (not `createQueryBuilder`). Keep the existing `getPantryLastUpdatedAt` query-shape mock describe. Seed explicit `updated_at` ISOs (do not rely on `DEFAULT_TS`). Cases: (1) A has 10d + 1d, B has an older pickle → A’s result is A’s 10d ISO; (2) seed 10d + 1d, `removePantryItem` the 10d id, re-read → 1d ISO; (3) seed 10d + 1d, `removePantryItem` the 1d id, re-read → 10d ISO; (4) seed one row, `removePantryItem` it, re-read → `null`. Do not assert formatter copy. Do not add an “edit the fresher row” case this phase.

Optional honesty: rename the mock it `"returns the oldest updated_at"` so it does not claim MIN (it echoes one mocked string). Do not delete the call-shape assertions (`select("updated_at")`, `order(… ascending: true)`, `limit(1)`, `maybeSingle()`).

### Success Criteria:

#### Automated Verification:

- `createSupabaseFake` supports `.limit()` and `.maybeSingle()`; 0-row `maybeSingle` is `{ data: null, error: null }`, not PGRST116
- `pantry.test.ts` fake-store cases: mixed-age MIN (B’s older row ignored); delete stalest; delete fresher; delete last → `null`
- Existing query-shape mock for `getPantryLastUpdatedAt` remains (select / order / limit / maybeSingle / throw-on-error)
- Unit tests pass: `npm test`
- Linting passes: `npm run lint`

#### Manual Verification:

- `maybeSingle` is not implemented as a call through `single()` / `toSingle`
- The mock it that echoes one timestamp is not treated as the MIN oracle (name or comment makes that obvious)
- No new API envelope cases and no jsdom

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Cookbook §6.5 / §6.6 and CI sentence lock

### Overview

Lock the floor by documenting what CI **already** runs and teaching the freshness pattern this change shipped. Do not add YAML. Do not treat “add `npm test`” as the work.

- **Behavior asserted:** A later agent adding a date-threshold test injects `now`, asserts booleans, treats household freshness as MIN, and does not use copy / Playwright / `index.astro` as the oracle. A later agent adding tests does not create a second workflow; new tests ride `npm test` in `.github/workflows/ci.yml`.
- **Regression caught:** Docs that say lint+build on `master`; a well-meaning `ci-tests.yml`; cookbook that says helper-null is the load-error case; documenting a typecheck floor `astro build` does not run.
- **Research source:** `research.md` Cross-cutting (“What ‘lock the floor without new YAML’ is”; cookbook §6.5 / §6.6 bullets); `ci.yml:1-26`; `CLAUDE.md:54-56`; `AGENTS.md:35,39`.
- **Edge/boundary:** Branch name is `main`, not `master`. Runner is Vitest (`vi.mock`, node, `src/**/*.test.ts`), not the lessons Jest heading. Lefthook ≠ CI. GitHub required checks are **not** claimed.
- **Anti-pattern avoided:** New workflow file; grep-test of `ci.yml`; adding `npm test` as if missing; rewriting frozen §1–§5; backporting §2 Must-challenge in this change; copying “Always add Jest” as the cookbook voice.

### Changes Required:

#### 1. Freshness cookbook

**File**: `context/foundation/test-plan.md` (§6.5)

**Intent**: Replace the Phase 3 TBD with the pattern that actually shipped.

**Contract**: Fill §6.5 with: colocated `pantry-freshness.test.ts` for elapsed rules and the view helper; `pantry.test.ts` fake-store for MIN/delete; API envelope stays `freshness-api.test.ts` with `vi.mock("@/lib/supabase")` (not a MIN oracle). Clock: inject `now`; elapsed vs `STALE_AFTER_MS`; inclusive `>=` at 168h. Oracle: `isStale` / `isEmpty` / `kind` / `showNudge` — copy tests may exist for FR-007 wording but are not the staleness proof. Empty vs error: `null` is empty only if load succeeded; `loadError` is a separate input; do not treat helper-null as the load-error case. MIN: oldest `updated_at`; fake must implement `limit` + `maybeSingle` (empty ≠ PGRST116); deleting a fresher row does not change MIN; deleting the stalest or last row does. Anti-patterns: English as the only assertion; mocked-service “oldest”; Playwright / jsdom; importing `index.astro`. Run: `npm test` (already in existing CI). Bump header “Last updated”. Do not edit §1–§5.

#### 2. Phase 3 notes

**File**: `context/foundation/test-plan.md` (§6.6)

**Intent**: Record the quality floor this phase locked without implying new plumbing.

**Contract**: Add a **§3 Phase 3 (`testing-freshness-quality-floor`)** bullet: one job in `.github/workflows/ci.yml` — `npm run lint` → `npm test` (`vitest run`) → `npm run build` on push/PR to `main`; do not add a second workflow; new tests ride `npm test`; runner is Vitest not Jest; `astro build` does not typecheck (do not document a typecheck floor CI does not run); local lefthook ≠ CI; husky leftovers are not the hook; GitHub required checks are a repo setting, not this guide. Do not edit §5’s table.

#### 3. Agent CI sentences

**Files**: `CLAUDE.md` (CI section), `AGENTS.md` (Commit and Pull Request Guidelines)

**Intent**: Stop telling agents the merge bar is lint+build on `master`.

**Contract**: Both CI/PR sentences must say PRs/pushes target **`main`** and CI runs **lint + test + build** via `.github/workflows/ci.yml`. Keep the AGENTS.md Testing paragraph (already correct: Vitest; CI runs `npm test` after lint). Do not rewrite the husky / lint-staged / lefthook lines in this phase. Do not add a workflow file. Do not add a test that greps `ci.yml`.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` §6.5 no longer contains `TBD — see §3 Phase 3`
- `context/foundation/test-plan.md` §6.6 includes a Phase 3 floor + freshness note
- `CLAUDE.md` CI paragraph names lint, test, and build on `main`
- `AGENTS.md` PR paragraph names lint, test, and build on `main`
- `.github/workflows/` still contains only `ci.yml` (no new YAML)
- `npm test` still passes: `npm test`

#### Manual Verification:

- A reader of §6.5 can name injected `now`, boolean oracles, MIN vs MAX, empty vs `loadError`, and “when not Playwright” without opening this plan
- A reader of §6.6 / agent rules would not add `ci-tests.yml` or add `npm test` as a missing step
- Test-plan §1–§5 body (risk table, file counts, “build typechecks”) was not rewritten

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `resolvePantryFreshnessView`: error vs empty vs ok+nudge vs ok+no-nudge; error wins over a stale ISO. Injected `NOW`. Booleans only.
- Existing `evaluatePantryFreshness` / formatter tests stay; do not duplicate elapsed-ms cases except as `showNudge` composition.

### Integration Tests:

- `createSupabaseFake` + `getPantryLastUpdatedAt` / `removePantryItem`: mixed-age MIN, foreign older row ignored, delete stalest / fresher / last.
- Query-shape mock remains for select/order/limit/maybeSingle and throw ≠ empty.

### Manual Testing Steps:

1. Confirm helper tests never use English as the only oracle.
2. Confirm `PantryFreshness.tsx` calls the helper on the loadError path.
3. Confirm `maybeSingle` empty is not PGRST116; IDOR/list suites still green.
4. Confirm no new file under `.github/workflows/`.
5. Skim §6.5 / §6.6 for MIN, empty-vs-error, and “no second YAML.”

## Performance Considerations

None. Fixtures are two pantry rows and a fixed `Date`.

## Migration Notes

None. Production behavior of MIN, 168h, and loadError UI must not change. The view helper is a extract-and-wire of the island’s existing decision table. If a new test fails on current code, that is a real freshness bug — fix it in the same change rather than weakening the assertion. Fake `limit` / `maybeSingle` must not alter `.single()` empty semantics.

## References

- Related research: `context/changes/testing-freshness-quality-floor/research.md`
- Quality contract: `context/foundation/test-plan.md` §2 Risk #6; §3 Phase 3; §5 CI floor lock; §6.5 / §6.6
- Sibling rollout plans: `context/changes/testing-critical-path-coverage/plan.md`, `context/changes/testing-isolation-around-apis/plan.md`
- Archive S-05: `context/archive/2026-09-07-stale-pantry-reminder/plan.md` (MIN addendum, empty vs loadError, 168h inclusive)
- Lessons: colocated `*.test.ts`; Vitest not Jest; DB errors must not look like empty lists
- Helper + clock: `src/lib/pantry-freshness.ts`
- MIN query: `src/lib/services/pantry.ts:37-51`
- Island: `src/components/pantry/PantryFreshness.tsx`
- SSR seed: `src/pages/index.astro:20-50,82`
- Fake: `src/test/supabase-fake.ts`
- CI: `.github/workflows/ci.yml`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Load error is not empty

#### Automated

- [x] 1.1 `src/lib/pantry-freshness.test.ts` asserts the five view-helper cases (`kind` + `showNudge` only) — e7693c2
- [x] 1.2 `src/lib/pantry-freshness.ts` exports the helper; `PantryFreshness.tsx` calls it for error vs empty vs nudge — e7693c2
- [x] 1.3 Unit tests pass: `npm test` — e7693c2
- [x] 1.4 Linting passes: `npm run lint` — e7693c2

#### Manual

- [x] 1.5 Helper tests do not snapshot nudge / empty / error English as the oracle — e7693c2
- [x] 1.6 `PantryFreshness.tsx` does not call `evaluatePantryFreshness` on the `loadError` path — e7693c2
- [x] 1.7 No jsdom, Playwright, or `index.astro` import was added — e7693c2

### Phase 2: MIN freshness and reframed delete

#### Automated

- [x] 2.1 `createSupabaseFake` supports `.limit()` and `.maybeSingle()`; 0-row `maybeSingle` is `{ data: null, error: null }`, not PGRST116 — 33a8238
- [x] 2.2 `pantry.test.ts` fake-store cases: mixed-age MIN (B’s older row ignored); delete stalest; delete fresher; delete last → `null` — 33a8238
- [x] 2.3 Existing query-shape mock for `getPantryLastUpdatedAt` remains (select / order / limit / maybeSingle / throw-on-error) — 33a8238
- [x] 2.4 Unit tests pass: `npm test` — 33a8238
- [x] 2.5 Linting passes: `npm run lint` — 33a8238

#### Manual

- [x] 2.6 `maybeSingle` is not implemented as a call through `single()` / `toSingle` — 33a8238
- [x] 2.7 The mock it that echoes one timestamp is not treated as the MIN oracle (name or comment makes that obvious) — 33a8238
- [x] 2.8 No new API envelope cases and no jsdom — 33a8238

### Phase 3: Cookbook §6.5 / §6.6 and CI sentence lock

#### Automated

- [x] 3.1 `context/foundation/test-plan.md` §6.5 no longer contains `TBD — see §3 Phase 3` — 373013e
- [x] 3.2 `context/foundation/test-plan.md` §6.6 includes a Phase 3 floor + freshness note — 373013e
- [x] 3.3 `CLAUDE.md` CI paragraph names lint, test, and build on `main` — 373013e
- [x] 3.4 `AGENTS.md` PR paragraph names lint, test, and build on `main` — 373013e
- [x] 3.5 `.github/workflows/` still contains only `ci.yml` (no new YAML) — 373013e
- [x] 3.6 `npm test` still passes: `npm test` — 373013e

#### Manual

- [x] 3.7 A reader of §6.5 can name injected `now`, boolean oracles, MIN vs MAX, empty vs `loadError`, and “when not Playwright” without opening this plan — 373013e
- [x] 3.8 A reader of §6.6 / agent rules would not add `ci-tests.yml` or add `npm test` as a missing step — 373013e
- [x] 3.9 Test-plan §1–§5 body (risk table, file counts, “build typechecks”) was not rewritten — 373013e
