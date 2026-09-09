---
date: 2026-09-09T11:55:00+02:00
researcher: Marcin
git_commit: 44e4f6de2f17a9583b4043a7e14754a280fd681d
branch: 10x-test-plan
repository: co-na-obiad
topic: "Ground rollout Phase 3 — freshness nudge (Risk #6) and CI quality floor"
tags: [research, codebase, pantry-freshness, ci, test-plan, vitest]
status: complete
last_updated: 2026-09-09
last_updated_by: Marcin
---

# Research: Ground rollout Phase 3 — freshness nudge and CI quality floor

**Date**: 2026-09-09T11:55:00+02:00
**Researcher**: Marcin
**Git Commit**: [44e4f6de2f17a9583b4043a7e14754a280fd681d](https://github.com/MarcinG-DKA/co-na-obiad/commit/44e4f6de2f17a9583b4043a7e14754a280fd681d)
**Branch**: 10x-test-plan
**Repository**: co-na-obiad

## Research Question

Ground rollout Phase 3 of `context/foundation/test-plan.md` (“Freshness + quality floor”).

Risks to verify: **#6** freshness line lies (empty pantry shows the 7-day nudge, or a pantry older than 7×24h does not); **cross-cutting** lint + test + build stay the merge bar and cookbook §6 is filled for the patterns this phase ships.

Risk response guidance to verify, not blindly accept:

- **#6**: prove empty pantry shows no 7-day nudge, oldest item ≥ 168h shows the nudge, under 168h does not, and load error is not treated as empty. Challenge any `updated_at` ⇒ reminder is correct and deleting a fresh row clears the nudge. Avoid snapshot of English copy as the only assertion.
- **Cross-cutting**: prove lint + test + build stay the merge bar (no new CI YAML in this guide) and fill cookbook §6. Challenge adding a new workflow file as the floor. Avoid treating existing CI as proven without checking what actually runs.

Hot-spot directories (likelihood evidence, not anchors): `src/` — Risk #6 was raised by PRD US-03 / FR-007 / FR-008 and roadmap S-05 shipping, not by a churn directory.

Stack: Vitest 5.x (node env, colocated `src/**/*.test.ts`); CI already runs lint + test + build; Phase 3 locks that floor without new YAML; cookbook §6.5 is TBD for freshness / date-threshold tests.

## Summary

Neither item is speculative as a **regression class**. Both are **already implemented more than the test plan’s “gap-fill” wording implies**, with two corrections that will mis-plan the suite if ignored.

**Risk #6.** The household nudge on `/` is a shipped S-05 control: SSR seeds `getPantryLastUpdatedAt` → `PantryFreshness`; the island evaluates `isStale` (`elapsedMs >= 7×24h`) and renders the inaccuracy line. Empty is `lastUpdatedAt === null` **after a successful load** → `isStale: false` → no nudge. Load failure is a **separate** `loadError` flag; the island never calls `evaluatePantryFreshness` in that branch. Live contract is **MIN(`updated_at`)** (oldest / stalest item), not MAX / newest edit. The test-plan challenge “any `updated_at` ⇒ reminder is correct” is the right challenge — live code already rejects it. The challenge “deleting a fresh row clears the nudge” is **the wrong scenario**: deleting a fresher row leaves MIN unchanged; deleting the **stalest** row (or the last row) is what changes the dashboard. Pure helper tests already prove empty / ≥168h / under-168h via the `isStale` boolean with an injected `now`. Gaps: (1) mixed-age MIN and delete→recompute are untested because `createSupabaseFake` has **no** `.limit()` / `.maybeSingle()`; (2) loadError ≠ empty lives only in SSR/island wiring, which `evaluatePantryFreshness(null)` cannot see. Cheapest layer remains **unit / fake-store**, not Playwright.

**Cross-cutting.** [`.github/workflows/ci.yml`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/.github/workflows/ci.yml) is the **only** workflow. It already runs `npm run lint` → `npm test` (`vitest run`) → `npm run build` on push/PR to **`main`**. “Lock the floor” is **not** “add `npm test`” and **not** a second YAML file. Agent rules still say “lint + build on `master`” (`CLAUDE.md`, `AGENTS.md` PR paragraph). `astro build` does **not** typecheck. Local lefthook runs related Vitest + `tsc --noEmit`; that is not the CI floor. Cheapest lock-in: document the three existing `run:` lines in cookbook §6.6, align CLAUDE/AGENTS, fill §6.5 from the freshness gaps above. Adding `ci-tests.yml` is the listed anti-pattern.

Hot-spot `src/` is **empty likelihood evidence** for #6 (the Source column already cites PRD/roadmap shipping). Failure lives in a **narrow cluster**, not “all of `src/`.”

## Detailed Findings

### Risk #6 — freshness line lies

#### Failure path

| Step | Where |
|------|--------|
| Homepage SSR | [`src/pages/index.astro:20-47`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/index.astro#L20-L47) `Promise.allSettled` with household + `listMatches` + `getPantryLastUpdatedAt` |
| Success seed | [`index.astro:43-44`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/index.astro#L43-L44) fulfilled → `lastUpdatedAt` |
| Load-error seed | [`index.astro:45-50`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/index.astro#L45-L50) rejected **or** `!supabase && householdId` → `freshnessLoadError = true` (`lastUpdatedAt` stays `null`) |
| Mount island | [`index.astro:82`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/index.astro#L82) `<PantryFreshness initialLastUpdatedAt={…} loadError={freshnessLoadError} />` |
| Refetch API | [`src/pages/api/pantry/freshness.ts:23-27`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/api/pantry/freshness.ts#L23-L27) `GET` → `{ data: { lastUpdatedAt } }` or 500 |
| Island refetch | [`PantryFreshness.tsx:19-62`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L19-L62) `pageshow` (bfcache) + `visibilitychange` → `/api/pantry/freshness`; **failed refetch keeps last good value** |
| Load-error UI | [`PantryFreshness.tsx:65-67`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L65-L67) early return; **no** evaluate / nudge |
| Boolean | [`pantry-freshness.ts:18-27`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/lib/pantry-freshness.ts#L18-L27) + [`PantryFreshness.tsx:69-85`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L69-L85) `isStale` gates the nudge |
| Service | [`pantry.ts:37-51`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/lib/services/pantry.ts#L37-L51) MIN query |
| Pantry page (separate product) | [`PantryManager.tsx:188`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryManager.tsx#L188) per-item `formatPantryItemNeedsReview` — **no** household nudge on `/pantry` |

```37:51:src/lib/services/pantry.ts
export async function getPantryLastUpdatedAt(supabase: AppSupabaseClient, householdId: string): Promise<string | null> {
  // Oldest updated_at: the dashboard line and 7-day nudge track the stalest item, not the latest edit.
  const { data, error } = await supabase
    .from("pantry_items")
    .select("updated_at")
    .eq("household_id", householdId)
    .order("updated_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  // ...
  return data?.updated_at ?? null;
}
```

```18:27:src/lib/pantry-freshness.ts
export function evaluatePantryFreshness(lastUpdatedAt: string | null, now: Date): PantryFreshness {
  if (lastUpdatedAt === null) {
    return { lastUpdatedAt: null, isEmpty: true, isStale: false };
  }

  return {
    lastUpdatedAt,
    isEmpty: false,
    isStale: elapsedMs(lastUpdatedAt, now) >= STALE_AFTER_MS,
  };
}
```

```65:85:src/components/pantry/PantryFreshness.tsx
  if (hasLoadError) {
    return <p className="text-center text-sm text-red-300">Could not load pantry status.</p>;
  }

  const now = new Date();
  const freshness = evaluatePantryFreshness(lastUpdatedAt, now);
  // ...
      {freshness.isStale ? (
        <p ... role="status">
          Recipe matches may be inaccurate.{" "}
          <a href="/pantry" ...>Review pantry</a>
        </p>
      ) : null}
```

There is **no MAX / `ascending: false` path** in `src/`. S-05 originally planned newest (`MAX`); impl flipped to oldest. Archive addendum (2026-09-07) is the live contract: [`context/archive/2026-09-07-stale-pantry-reminder/plan.md`](../../archive/2026-09-07-stale-pantry-reminder/plan.md) § “oldest item, not newest.”

**DB:** `pantry_items.updated_at` defaults to `now()` on insert; `BEFORE UPDATE` trigger bumps **that row only**. DELETE does not rewrite survivors. Next `getPantryLastUpdatedAt` re-reads MIN among remaining rows. ([`supabase/migrations/20260902111000_pantry_items.sql:10-11, 43-57`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/supabase/migrations/20260902111000_pantry_items.sql#L10-L57))

#### Empty vs load error vs stale

| Condition | Representation | UI |
|-----------|----------------|----|
| Successful load, no rows | `lastUpdatedAt === null`, `loadError === false` | `"Pantry is empty."`, **no nudge** (`isStale: false`) |
| Load failed | `freshnessLoadError === true` (`lastUpdatedAt` still `null`) | `"Could not load pantry status."` — **no** empty copy, **no** nudge |
| Oldest ≥ 168h | `isStale: true` | last-updated line + `"Recipe matches may be inaccurate."` + Review pantry |
| Oldest < 168h | `isStale: false` | last-updated line only |

`evaluatePantryFreshness` has **no `loadError` parameter**. `null` is empty **only when the caller already decided the load succeeded**. Distinguishing error from empty on `/` is **only** the `loadError` prop. That is the historical bug class (plan-review F1 / lessons “DB errors looking like empty lists”): missing Supabase used to look empty; [`index.astro:48-50`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/index.astro#L48-L50) now forces `freshnessLoadError` in that case.

**Refetch caveat:** a failed island refetch **keeps** the last good SSR value ([`PantryFreshness.tsx:33-34`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L33-L34)). It does not flip success → empty. It also does not promote a later failure into the SSR error branch. Do not treat that keep-last-good path as the loadError≠empty prove.

#### 168h / injected `now`

```1:1:src/lib/pantry-freshness.ts
export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
```

Inclusive `>=` at exactly 7×24h. Elapsed milliseconds, not calendar/TZ days. Future timestamps clamp via `Math.max(0, …)` → not stale. Helpers and unit tests inject `now` (`NOW = 2026-09-07T12:00:00.000Z`). The React island uses `new Date()` at render ([`PantryFreshness.tsx:69`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L69)). Archive accepted a seconds-level SSR vs client disagreement at the exact boundary. Do not add a clock-sync e2e for that.

#### Challenge: “any `updated_at` ⇒ reminder is correct”

**Keep the challenge; live code already uses MIN.** Mixed pantry (one item 1d old + one 8d old):

| Surface | Behavior |
|---------|----------|
| `/` household line | MIN = 8d → “Oldest item updated 8 days ago” + **nudge on** |
| Editing only the fresh item | Does **not** clear the nudge (stalest row unchanged) |
| `/pantry` | No household nudge; **only** the 8d row gets `"Updated 8 days ago. Needs review."` |

Two products, one threshold (`STALE_AFTER_MS`):

1. **Household** (`evaluatePantryFreshness` + `PantryFreshness`) — US-03 / FR-007 / FR-008 on `/`
2. **Item-level** (`formatPantryItemNeedsReview` + `PantryManager`) — `/pantry` only

Risk #6’s prove-column is the **household** nudge. Item-level copy is already unit-tested; do not expand Phase 3 into a second Playwright tour of `/pantry`.

#### Challenge: “deleting a fresh row clears the nudge”

**Wrong as a general claim. Reframe.** Delete does not bump remaining `updated_at`. `getPantryLastUpdatedAt` re-queries MIN.

| Action | Effect on `/` nudge |
|--------|---------------------|
| Delete the **only** fresh item, stale remains | MIN → stale → nudge **appears/stays** (correct) |
| Delete the **stalest** item, only fresh remains | MIN → fresh → nudge **clears** |
| Delete a non-oldest fresh while stale remains | MIN unchanged → nudge **stays** |
| Delete the last row | `null` → empty → no nudge |

The useful prove is: **deleting the stalest row (or clearing the pantry) changes MIN; deleting a fresher row does not refresh remaining timestamps.**

#### English copy (do not use as the only oracle)

**Household line** (`formatPantryLastUpdated`): `"Pantry is empty."` / `"Oldest item updated today"` / `"Oldest item updated 1 day ago"` / `"Oldest item updated ${days} days ago"`.

**Nudge** (JSX, not the helper): `"Recipe matches may be inaccurate."` + link `"Review pantry"`.

**Load error:** `"Could not load pantry status."`

**Item-level:** `null` or `"Updated N days ago. Needs review."`

`formatPantryLastUpdated` / `formatPantryItemNeedsReview` tests **do** snapshot those strings. Staleness itself is **also** asserted via `isStale` in `evaluatePantryFreshness` tests — copy is not the only threshold oracle. The nudge JSX has **no** component test. Phase 3 must not add copy snapshots as the sole `isStale` proof.

#### Existing tests

Three files touch freshness. **16** colocated `src/**/*.test.ts` files exist (test-plan §4 still says 13 — stale).

| File | What it actually asserts |
|------|--------------------------|
| [`src/lib/pantry-freshness.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/lib/pantry-freshness.test.ts) | Injected `NOW`. `null` → `isEmpty` + **`isStale: false`**. Under 7d not stale. **Exactly** `STALE_AFTER_MS` stale. 8d stale. Future not stale. Copy snapshots for the last-updated line and per-item review. |
| [`src/lib/services/pantry.test.ts:115-135`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/lib/services/pantry.test.ts#L115-L135) | Hand-rolled query-builder mock (not `createSupabaseFake`). Empty → `null`. Query shape: `select("updated_at")`, `order(… ascending: true)`, `limit(1)`, `maybeSingle()`. Single mocked timestamp echoed (name says “oldest”). Throw on PostgREST error (**service** load-error ≠ empty). Later describes use the fake for **IDOR**, not freshness. |
| [`src/pages/api/pantry/freshness-api.test.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/pages/api/pantry/freshness-api.test.ts) | `vi.mock` of `getPantryLastUpdatedAt`. Envelope: 401 / 400 / 500 config / 500 throw / `{ lastUpdatedAt: null }` / echoed ISO. The `"returns the oldest updated_at timestamp"` case **overclaims MIN** — it echoes a mocked string. |

**No** React/component tests (`*.test.tsx` / jsdom / RTL not in the runner). **No** `index.astro` tests (Astro page; `include: ["src/**/*.test.ts"]`; importing it loads `astro:env`).

#### Prove-column coverage

| Behavior | Covered? | Gap |
|----------|----------|-----|
| Empty pantry → no 7-day nudge | Partial | Helper `isStale: false` for `null`. No proof the island omits the nudge block. |
| Oldest ≥ 168h → nudge | Partial | Helper `isStale: true` at exactly 168h and 8d. No island render. |
| Under 168h → no nudge | Partial | Helper `isStale: false` at 168h − 1h. |
| Load error ≠ empty | Partial (service/API only) | Service throw; API 500. **Missing:** `loadError=true` + `lastUpdatedAt=null` is **not** empty / **not** nudge. Helper-null is the empty case, not the error case. |
| MIN not MAX (mixed ages) | Weak | Query `order ascending` asserted. No two-timestamp fixture. |
| Injected `now` | Yes | `pantry-freshness.test.ts` |
| Delete recomputes oldest | No | `removePantryItem` tests never call `getPantryLastUpdatedAt` after delete. |
| UI gates nudge on `isStale` | No tests | Impl does ([`PantryFreshness.tsx:75`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/components/pantry/PantryFreshness.tsx#L75)). |

#### Fake-store blocker (cheapest MIN/delete test)

[`createSupabaseFake`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/test/supabase-fake.ts) already sorts pantry rows by `order` ([`sortPantry` / `builder.order`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/test/supabase-fake.ts#L156-L171)) and already supports `removePantryItem` (IDOR describes). It does **not** implement `.limit()` or `.maybeSingle()`. `getPantryLastUpdatedAt` needs both.

If `maybeSingle` were aliased to existing `single()` / `toSingle()`, **empty pantry would look like a load error**: `toSingle([])` returns PGRST116 ([`supabase-fake.ts:289-294`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/src/test/supabase-fake.ts#L289-L294)); the service throws. PostgREST `maybeSingle` on 0 rows is `{ data: null, error: null }` — that is how empty becomes `null` rather than 500. Without `limit(1)`, `maybeSingle` on two mixed-age rows would also error (multiple rows). Extending the fake is a **prerequisite** for a real MIN+delete proof, not optional polish. Patching `updated_at` on update already happens (`applyPantryPatch` sets `isoNow()`), so “edit the fresher row, MIN unchanged” is expressible once `limit`/`maybeSingle` exist.

#### Cheapest useful extra tests (not a suite dump)

1. **Extend `createSupabaseFake` with `limit` + `maybeSingle`** (empty → `{ data: null, error: null }`, not PGRST116). Then one `getPantryLastUpdatedAt` describe against the fake: two rows (10d + 1d) → older ISO; `removePantryItem` the older → remaining ISO; `removePantryItem` the last → `null`. Covers MIN≠MAX + the **reframed** delete challenge. Keep the existing query-shape mock test.

2. **Load error ≠ empty without jsdom / Astro.** Extract a tiny view helper (inputs: `lastUpdatedAt`, `loadError`, `now` → `{ kind: "error" \| "empty" \| "ok", showNudge }`) used by `PantryFreshness`, and unit-test: `loadError` + `null` → error / `showNudge: false` / not empty; `null` + no error → empty / no nudge; stale ISO → `showNudge: true`. Assert `kind` and `showNudge`, not English as the only oracle. Do **not** import `index.astro`. Do **not** add `@testing-library/react` / jsdom / Playwright for this risk.

3. **Do not add more copy snapshots** for #6. Boundary `isStale` cases already exist.

Skip: more API envelope cases; treating mocked-service “oldest” as MIN; kitchen-flow e2e; item-level `/pantry` UI.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove: empty → no nudge; ≥168h → nudge; under → no; load error ≠ empty | **Keep.** Empty / 168h / under are already helper-proven via `isStale`. Load error ≠ empty is implemented and **not** helper-proven. |
| Challenge: any `updated_at` ⇒ reminder is correct | **Keep.** Live contract is MIN (stalest). Mixed-age fake test is the cheapest way to lock it. |
| Challenge: deleting a fresh row clears the nudge | **Correct the challenge.** Deleting a **fresher** row does not clear it. Deleting the **stalest** (or last) row does. |
| Context: MIN vs MAX, injected `now`, empty vs load error | **Confirmed.** Also: `evaluatePantryFreshness` cannot see `loadError`; fake lacks `limit`/`maybeSingle`. |
| Cheapest: unit (already present) — only add what is missing | **Keep, with the two gap-fills above.** Do not add Playwright. Do not re-test copy as the threshold. |
| Anti-pattern: snapshot of English copy as the only assertion | **Keep.** Helper already mixes boolean + copy; do not make copy the island oracle. |

Risk #6 is **not speculative**. No new product safeguard is required before Phase 3; the work is proving / locking what exists.

Hot-spot `src/`: **not an anchor, and not useful likelihood evidence.** Code lives in `src/lib/pantry-freshness.ts`, `src/lib/services/pantry.ts` (`getPantryLastUpdatedAt`), `src/pages/api/pantry/freshness.ts`, `src/components/pantry/PantryFreshness.tsx`, `src/pages/index.astro` (seed), plus per-item `PantryManager.tsx`. §2 Source (PRD / S-05 shipped) is the honest evidence; do not rewrite it to a file path.

---

### Cross-cutting — CI quality floor + cookbook §6

#### What CI actually runs

One file, one job, no siblings, no commented-out second workflow:

```1:26:.github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx astro sync
      - run: npm run lint
      - run: npm test
      - run: npm run build
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}
```

| Claim | Reality |
|-------|---------|
| `npm test` in CI | **Yes** (`vitest run` via [`package.json:17`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/package.json#L17)), after lint, before build. Present since 2026-09-02. |
| Branch | **`main`**, not `master` |
| Secrets | Build step only |
| Second workflow | **None** (`.github/workflows/` contains only `ci.yml`) |
| “Merge bar” as GitHub required check | **Not proven.** `main` is not branch-protected in this session’s prior check. Cookbook can state the intended bar; it cannot invent required checks. |
| `npm run build` typechecks | **No.** `"build": "astro build"` only. `@astrojs/check` is a dependency and unused. Type-aware ESLint (`strictTypeChecked`) + leftover lefthook `tsc --noEmit` are not “build = types.” |
| Local = CI | **No.** [`lefthook.yml`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/lefthook.yml) runs staged ESLint (no `.astro`), full `tsc --noEmit`, `vitest related`. Husky + lint-staged remain in the tree and are **not** the git hook (lefthook owns `pre-commit`). |

Vitest: [`vitest.config.ts`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/vitest.config.ts) `environment: "node"`, `include: ["src/**/*.test.ts"]`, `globals: true`. No Jest config remains.

#### Agent-rule drift (part of locking the floor)

- [`CLAUDE.md:54-56`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/CLAUDE.md#L54-L56): “runs lint + build … PR to **master**.” Omits `npm test`; wrong branch. Pre-commit line still says husky + lint-staged.
- [`AGENTS.md:35`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/AGENTS.md#L35): Testing paragraph is **correct** (Vitest; CI runs `npm test` after lint).
- [`AGENTS.md:39`](https://github.com/MarcinG-DKA/co-na-obiad/blob/44e4f6de2f17a9583b4043a7e14754a280fd681d/AGENTS.md#L39): PR guidelines repeat “lint + build” / **`master`**.
- [`lessons.md`](../../foundation/lessons.md): heading “Always add **Jest** tests” still says keep tests in `ci.yml` after lint (CI advice still good); following rule is “Unit tests run on **Vitest**, not Jest.” Cookbook §6 must say Vitest / `vi.mock`, not copy the Jest heading.

Phase 1 research already concluded: CI runs `npm test`; **no new YAML** for test additions ([`testing-critical-path-coverage/research.md`](../testing-critical-path-coverage/research.md) “No new YAML for Jest additions” — runner name stale, conclusion still right). Phase 2 did not re-read `ci.yml` and never proposed new YAML.

Test-plan §5 “CI floor lock / no new YAML in this guide” matches the file. §5 “lint + typecheck … `npm run build`” **overclaims**. §3 Phase 1 e2e row is already Vitest `shouldRedirectUnauthenticated` under `npm test` — do not read it as a second workflow.

#### What “lock the floor without new YAML” is

| Option | Verdict |
|--------|---------|
| Document the three existing `run:` lines in §5/§6.6; forbid a second workflow | **Cheapest and sufficient for this guide** |
| Align CLAUDE.md + AGENTS.md PR/CI sentences to lint + test + build on `main` | **Yes — docs are currently lying** |
| Grep-test `ci.yml` for the three scripts | Skip — brittle, almost no signal |
| Add `npm test` to YAML | **Already there.** Do not treat “lock” as this edit |
| New workflow file | **Anti-pattern.** Duplicate minutes; two branch filters to drift; contradicts Phase 1 research and §5 |
| Add `astro check` / `tsc` to **this** YAML | Optional extra, **out of Phase 3 prove-column**. If typecheck is desired later, edit `ci.yml` in place |
| GitHub required check on job `ci` | Repo setting, not YAML, not this guide |

#### Cookbook this phase must fill

**§6.5 Adding a freshness / date-threshold test** (today TBD):

- **Location**: colocated `src/lib/pantry-freshness.test.ts` for rules; `src/lib/services/pantry.test.ts` fake-store for MIN/delete; API envelope stays `freshness-api.test.ts` with `vi.mock("@/lib/supabase")` (envelope only — not a MIN oracle).
- **Clock**: inject `now` (fixed `Date`). Elapsed vs `STALE_AFTER_MS`. Inclusive `>=` at 168h.
- **Oracle**: `isStale` / `isEmpty` / `showNudge` booleans. Copy tests may exist for FR-007 wording; they are **not** the staleness proof.
- **Empty vs error**: `null` last-updated is empty **only if load succeeded**. `loadError` is a separate input. Do not treat helper-null as the load-error case.
- **MIN**: household freshness is oldest `updated_at`, not newest. Fake must implement `limit` + `maybeSingle` (empty ≠ PGRST116).
- **Anti-pattern**: English snapshot as the only assertion; mocked-service “oldest”; Playwright / jsdom for the island; importing `src/pages/index.astro`.
- **Run**: `npm test` (already in existing CI).

**§6.6 Phase 3 notes:**

- Floor is **one** job in `.github/workflows/ci.yml`: `npm run lint` → `npm test` (`vitest run`) → `npm run build` on push/PR to `main`.
- **Do not add a second workflow.** New tests ride `npm test`.
- Runner is **Vitest**, not Jest (`vi.mock`, node env, `src/**/*.test.ts`). Ignore the lessons “Always add Jest” heading; follow the Vitest rule under it.
- `astro build` does not typecheck. Do not document a typecheck floor CI does not run.
- Local lefthook ≠ CI. Husky leftovers are not the hook.
- Agent-rule drift (lint+build / `master`) is part of locking the floor, not new YAML.

#### Response guidance — verify / correct

| Guidance | Verdict |
|----------|---------|
| Prove: lint + test + build stay the merge bar | **Keep as intended bar.** YAML already runs all three. Docs/rules do not yet say so consistently. GitHub required checks are **not** this phase. |
| Fill cookbook §6 for patterns this phase ships | **Keep.** §6.5 is the freshness pattern; §6.6 Phase 3 notes are the floor. |
| Challenge: adding a new workflow file as the floor | **Confirmed.** Unnecessary. |
| Avoid treating existing CI as proven without checking | **We checked.** It already has `npm test`. “Lock” ≠ “add the step.” |
| No new CI YAML in this guide | **Keep.** |

Not speculative: the three scripts already run. Speculative: “CI does not run tests” (false); “we must add YAML to have a floor” (false).

---

## Code References

- `src/lib/pantry-freshness.ts:1` — `STALE_AFTER_MS` = 7×24h ms
- `src/lib/pantry-freshness.ts:18-27` — `evaluatePantryFreshness`; `null` → empty + not stale; `isStale` via `>= STALE_AFTER_MS`
- `src/lib/pantry-freshness.ts:30-43` — last-updated copy (“Oldest item…”)
- `src/lib/pantry-freshness.ts:45-53` — per-item `/pantry` review copy
- `src/lib/pantry-freshness.test.ts` — injected-`now` boolean + copy suite
- `src/lib/services/pantry.ts:37-51` — MIN query (`order updated_at asc`, `limit 1`, `maybeSingle`)
- `src/lib/services/pantry.test.ts:115-135` — query-shape mock; throw on error
- `src/pages/api/pantry/freshness.ts` — GET envelope; service throw → 500
- `src/pages/api/pantry/freshness-api.test.ts` — mocked-service envelope (not MIN)
- `src/pages/index.astro:20-50,82` — `allSettled` seed + `loadError` vs empty
- `src/components/pantry/PantryFreshness.tsx:19-85` — refetch keep-last-good; error early return; `isStale` gates nudge
- `src/components/pantry/PantryManager.tsx:188` — item-level review only
- `src/test/supabase-fake.ts` — sorts on `order`; **no** `limit` / `maybeSingle`; delete + `updated_at` bump on patch exist
- `supabase/migrations/20260902111000_pantry_items.sql:10-11,43-57` — default `updated_at`; update trigger
- `.github/workflows/ci.yml` — lint + test + build on `main`
- `package.json:6-18` — `build` = `astro build`; `test` = `vitest run`
- `vitest.config.ts` — node, `src/**/*.test.ts`
- `lefthook.yml` — related tests + `tsc`; not the CI floor
- `CLAUDE.md:54-56` / `AGENTS.md:35,39` — CI wording drift
- `context/foundation/lessons.md` — Jest heading vs Vitest rule; empty-vs-error class
- `context/archive/2026-09-07-stale-pantry-reminder/plan.md` — MIN addendum, empty vs loadError, 168h inclusive

## Architecture Insights

- Freshness is a **read model**: one household-scoped MIN timestamp, a pure elapsed-ms rule, and a small island above `MatchList`. It is not stored ranking and not folded into `GET /api/matches`.
- `null` is overloaded. Callers must pair it with a load-success bit. The helper cannot carry that bit today.
- S-05’s MAX→MIN flip is load-bearing: “I edited milk this morning” must not hide an 8-day-old egg. Tests that echo a single timestamp cannot see that bug.
- Cost × signal for date thresholds: injected `now` + boolean `isStale` beats DOM, snapshots, and calendar-day tests.
- The quality floor is **already a single GHA job**. Phase 3’s CI work is truth-telling (cookbook + agent rules), not plumbing.

## Historical Context (from prior changes)

- `context/archive/2026-09-07-stale-pantry-reminder/plan.md` — S-05: elapsed 168h inclusive; empty = no nudge; loadError ≠ empty copy; MIN addendum 2026-09-07; keep-last-good refetch; no household nudge on `/pantry`. No archived `research.md`. Automated helper/service/API tests were in Progress; island `loadError` was manual-only (impl-review F2).
- `context/changes/testing-critical-path-coverage/research.md` — Phase 1: freshness out of scope; CI already runs `npm test`; no new YAML (Jest name stale).
- `context/changes/testing-isolation-around-apis/research.md` — Phase 2: `PantryFreshness` refetch is Risk #6; `src/components` is a secondary path; leave §6.5 for Phase 3; fake-store pattern for isolation (this phase should reuse it for MIN, after `limit`/`maybeSingle`).
- `context/foundation/prd.md` US-03 / FR-007 / FR-008 + NFR — last-updated always visible; non-blocking 7-day reminder that matches may be inaccurate.
- `context/foundation/roadmap.md` S-05 — done, archived 2026-09-07; Lesson: —.

## Related Research

- [`context/changes/testing-critical-path-coverage/research.md`](../testing-critical-path-coverage/research.md) — Phase 1 matching + session gate
- [`context/changes/testing-isolation-around-apis/research.md`](../testing-isolation-around-apis/research.md) — Phase 2 isolation / IDOR / list-after-write
- Archive S-05 has no `research.md`; plan + plan-review + impl-review are the decision log

## Open Questions

- **Test-plan §2 Must-challenge cell** for Risk #6 says “deleting a fresh row clears the nudge.” Research reframes that. Backport the cell (wording only, no file anchors) on the next `/10x-test-plan` pass, or leave it for `--refresh`.
- **Test-plan §4** still says 13 test files; live count is **16**. Stack note, not a §2 risk. Refresh later unless Phase 3’s cookbook pass touches §4.
- **Test-plan §5** “lint + typecheck via `npm run build`” overclaims. Optional honest reword; do not add `astro check` in this phase unless the user expands scope.
- **GitHub required status check** on job `ci` would make the merge bar real. Out of this guide (repo setting).
- Whether to extract the loadError view helper vs skip island proof and rely on service-throw + SSR comments: research recommends the **tiny extract** because helper-null cannot see the bug class. `/10x-plan` should treat that as a solution-design choice, not re-litigate MIN vs MAX.
