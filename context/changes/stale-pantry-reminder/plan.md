# Stale Pantry Reminder Implementation Plan

## Overview

Show when the household pantry was last updated on `/`, and when that time is 7+ days old, add a non-blocking inline notice that recipe matches may be inaccurate, with a link to review `/pantry`. Empty pantries show “Pantry is empty” and skip the nudge. This delivers US-03, FR-007, and FR-008 (roadmap S-05).

## Current State Analysis

Pantry rows already store `created_at` / `updated_at` (`supabase/migrations/20260902111000_pantry_items.sql`). `updated_at` defaults to `now()` on INSERT and is bumped by a BEFORE UPDATE trigger. There is no household-level last-updated column, no `MAX(updated_at)` query, and no UI copy about freshness.

`/` (`src/pages/index.astro`) SSR-loads invite code + `listMatches` and mounts `MatchList`. It does not render pantry contents or a `/pantry` CTA (Topbar is the only nav). `MatchList` refetches `GET /api/matches` on `pageshow` (bfcache) and `visibilitychange` so returning from `/pantry` re-ranks without a dedicated matches UI on the pantry page.

`Banner.astro` is a full-width layout strip for config/env warnings (light theme). Product copy is English. `lessons.md` requires colocated Jest for new service/API behaviour; mock `@/lib/supabase` in API tests.

## Desired End State

A logged-in household member on `/` can:

- Always see a last-updated line when the pantry has items, in relative English (“Updated today”, “Updated 1 day ago”, “Updated 12 days ago”).
- See “Pantry is empty.” instead of a date when there are no items — and **not** see the 7-day inaccuracy nudge.
- When the latest item `updated_at` is 7+ elapsed days old, see an inline notice above the match list that matches may be inaccurate, with a link to `/pantry`. The notice stays until the pantry is updated; it is not dismissible and is not a modal.
- See that notice even if the recipe library is empty or matches failed to load.
- After reviewing pantry and coming back to `/`, see last-updated / nudge update without a full page reload (same visibility/pageshow refetch idea as `MatchList`).

**Verification:** `npm test`, `npm run lint`, and `npm run build` pass; Jest covers the freshness helper, last-updated query, and `GET /api/pantry/freshness`; browser checks fresh, stale, empty, refetch, and that matches still render.

### Key Discoveries:

- Per-item timestamps only — `src/lib/services/pantry.ts` `PantryItem.updated_at`; `households` has no pantry freshness field (`src/db/database.types.ts`).
- Homepage has no pantry query today — `src/pages/index.astro` `Promise.allSettled` is invite + `listMatches` only.
- `listMatches` already loads the full pantry for scoring (`src/lib/services/matching.ts`); do not piggyback freshness onto `/api/matches`.
- Visibility refetch pattern to copy — `src/components/matches/MatchList.tsx` (`pageshow` + `visibilitychange`).
- JSON API envelope to copy — `src/pages/api/pantry/index.ts` (`prerender = false`, `{ data }` / `{ error }`, 401 / 400 / 500).
- Static `/api/pantry/freshness` must live as its own file so it is not treated as `pantry/[id]`.

## What We're NOT Doing

- A `households.pantry_last_updated_at` (or similar) column — last-updated is `MAX(pantry_items.updated_at)` on read.
- Last-updated or nudge on `/pantry` (or any page other than `/`).
- Dismiss control, session storage, or persisted “don’t show again”.
- Modal, hard gate, toast-as-the-nudge, or reusing `Banner.astro` for this notice.
- Treating DELETE as a pantry update (deletes do not bump remaining rows’ `updated_at`; accepted tradeoff of MAX-on-read).
- Calendar-day / local-timezone “days”; expiry dates; email/push notifications.
- Changing matching, `MatchList` scoring, or the `/api/matches` payload.
- Playwright / React Testing Library — Jest at helper + service + API; UI is manual.
- i18n framework; Polish product copy (keep English like the rest of the app).

## Implementation Approach

Two sequential phases: **pure freshness rules + lightweight read + JSON GET**, then **homepage island**.

`evaluatePantryFreshness` / relative copy are pure functions with `now` injected (Jest, no Supabase). The DB read is one household-scoped `updated_at` ordered desc, limit 1 — not `listPantryItems`. `GET /api/pantry/freshness` returns that timestamp (or null if empty). `/` SSR-seeds a small React island above `MatchList`; the island refetches the freshness endpoint on the same visibility events as matches, independently.

## Critical Implementation Details

### Elapsed 7×24h, not calendar dates

Stale means `now - lastUpdatedAt >= 7 * 24 * 60 * 60 * 1000` (168 hours). Relative copy uses the same elapsed buckets (`floor` of 24-hour periods): 0 → “Updated today”, 1 → “Updated 1 day ago”, n → “Updated n days ago”. Clamp elapsed ms to `≥ 0` before flooring so a future timestamp cannot print a negative day count. Do not use local calendar dates or `Intl.RelativeTimeFormat` (no date library in `package.json`).

### Independent refetch, keep last good SSR data

Do not fold freshness into `GET /api/matches`. The island fetches `GET /api/pantry/freshness` on `pageshow` (including `event.persisted`) and `visibilitychange` when `visible`. If a refetch fails after a successful SSR seed, keep the previous `lastUpdatedAt` — do not replace a good line with a load error on every tab focus.

### Empty vs stale

`lastUpdatedAt === null` means no pantry rows **only when the freshness load succeeded**. Show “Pantry is empty.” and `isStale === false` in that case. Never show the inaccuracy nudge for an empty pantry. A failed load (`loadError`) must not reuse the empty copy — that is the same class of bug as treating a DB/config error as “no rows”.

---

## Phase 1: Freshness model and API

### Overview

Lock the 7-day / empty / relative-copy rules in a pure module, add a last-updated pantry read, and expose `GET /api/pantry/freshness` with the same auth envelope as other pantry JSON routes.

### Changes Required:

#### 1. Pure freshness helper

**File**: `src/lib/pantry-freshness.ts` (new), `src/lib/pantry-freshness.test.ts` (new)

**Intent**: Own empty/stale/relative-copy so SSR, the API consumer, and the island share one definition of “7 days” and one English last-updated string.

**Contract**: Export a stale threshold of 7 elapsed days in ms, `evaluatePantryFreshness(lastUpdatedAt: string | null, now: Date)` returning `{ lastUpdatedAt, isEmpty, isStale }`, and `formatPantryLastUpdated(freshness, now)` for the always-visible line. `null` last-updated → empty, not stale, copy “Pantry is empty.” Clamp elapsed ms to `≥ 0` before 24h bucketing so a future `updated_at` (clock skew) still formats as “Updated today”, never a negative day count. Colocated Jest covers empty, “today”, 1 day, 6d23h vs exactly 7d vs 8d, plural “days ago”, and `lastUpdatedAt` a few minutes after `now`.

#### 2. Last-updated pantry read

**File**: `src/lib/services/pantry.ts`, `src/lib/services/pantry.test.ts`

**Intent**: Read household last-updated without loading every pantry item (homepage already pays for a full pantry load inside `listMatches`).

**Contract**: Export `getPantryLastUpdatedAt(supabase, householdId): Promise<string | null>`. Query `pantry_items.updated_at` for that household, newest first, limit 1. Empty result → `null`. Throw on Supabase errors (same as `listPantryItems`). Extend the existing query-builder mock with `limit` / `maybeSingle` as needed.

#### 3. Freshness JSON route

**File**: `src/pages/api/pantry/freshness.ts` (new), tests colocated with pantry API tests (`src/pages/api/pantry/pantry-api.test.ts` or a sibling `freshness-api.test.ts`)

**Intent**: Give the homepage island a cheap refetch target that does not change `/api/matches` or dump the full pantry list.

**Contract**: `GET` + `const prerender = false`. Same 401 / 400 / “Supabase is not configured” 500 guards as `src/pages/api/pantry/index.ts`. Success `{ data: { lastUpdatedAt: string | null } }`. Service throw → 500 `{ error: "Could not load pantry status" }`. Mock `@/lib/supabase` in API tests. Static `freshness.ts` must win over `pantry/[id].ts`.

### Success Criteria:

#### Automated Verification:

- Freshness helper tests pass: `npm test` (empty, today, 1 day, 7-day boundary, relative copy, future `updated_at` clamped)
- `getPantryLastUpdatedAt` tests pass: empty → `null`, newest `updated_at` returned, DB error throws
- `GET /api/pantry/freshness` tests pass: 401, 400, 500 unconfigured, 500 on throw, `{ lastUpdatedAt: null }`, `{ lastUpdatedAt: "<iso>" }`
- Linting passes: `npm run lint`
- Full suite passes: `npm test`

#### Manual Verification:

- Authenticated `GET /api/pantry/freshness` on an empty pantry returns `{ data: { lastUpdatedAt: null } }`
- After adding or editing an item, the same GET returns that item’s `updated_at`
- Unauthenticated GET returns 401

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Homepage last-updated and nudge

### Overview

Put last-updated and the 7-day notice on `/` above the match list. SSR-seed from `getPantryLastUpdatedAt`; refetch on visibility like `MatchList`.

### Changes Required:

#### 1. Freshness island

**File**: `src/components/pantry/PantryFreshness.tsx` (new)

**Intent**: Render FR-007 always and FR-008 when stale, including a path to review pantry, without blocking matches.

**Contract**: Props `initialLastUpdatedAt: string | null`, `loadError?: boolean`. `client:load`. Derive empty/stale/copy via the Phase 1 helpers and `new Date()` (same clock for first paint and refetch). Call `evaluatePantryFreshness` only when `loadError` is false; `null` last-updated is empty **only then**. Always-visible line: `formatPantryLastUpdated`. When `isStale`, also show a non-blocking inline notice (not `Banner.astro`, not a dialog, not a toast) with copy that matches may be inaccurate and a link `href="/pantry"` (e.g. “Review pantry”). Show the stale notice even if `MatchList` is empty or in error. Initial `loadError` → “Could not load pantry status.” and no nudge (do not show “Pantry is empty.”). Refetch `GET /api/pantry/freshness` on `pageshow` / `visibilitychange` using the same in-flight coalescing idea as `MatchList`; on refetch failure keep the last good `lastUpdatedAt`. Cosmic glass styling; warning/orange for the nudge so it reads as caution, not a hard error. English only.

#### 2. Seed the island from `/`

**File**: `src/pages/index.astro`

**Intent**: First paint includes last-updated without a client round-trip; matches and freshness fail independently.

**Contract**: When `supabase` and `householdId` are set, load last-updated in the existing `Promise.allSettled` (third settled result, or equivalent parallel load). Do not skip matches if freshness fails, or vice versa. Rejected freshness → `loadError` true; do not pass `lastUpdatedAt: null` as empty. When `!supabase && householdId`, pass `loadError` true to `PantryFreshness` (same branch that already sets `matchesLoadError`). Mount `<PantryFreshness ... client:load />` **above** `MatchList` inside the household card. If there is no `householdId`, do not mount the island (keep “No household found.”).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Pantry updated today: `/` shows “Updated today” (or “Updated 0…” never — must be “Updated today”); no inaccuracy notice
- Pantry last updated 7+ days ago: last-updated line plus inline notice and working “Review pantry” link to `/pantry`; matches still visible
- Empty pantry: “Pantry is empty.”; no 7-day notice
- Empty recipe library (or matches load error) + stale pantry: notice still shows
- After editing pantry, returning to `/` (back or tab focus) updates last-updated and clears the notice without a full reload
- Freshness load failure: “Could not load pantry status.”; match list still renders
- `/pantry` has no last-updated line and no 7-day notice

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `evaluatePantryFreshness` / `formatPantryLastUpdated` with injected `now`: empty, <24h, 24h–48h, just under 7d, exactly 7d, over 7d, and `lastUpdatedAt` slightly after `now` (clamp → “Updated today”, not stale).
- `getPantryLastUpdatedAt`: no rows, one/newest row, thrown DB error.
- `GET /api/pantry/freshness`: auth/household/config/error/success (mock `@/lib/supabase` and the pantry service).

### Integration Tests:

None beyond the existing Jest API route tests. No Playwright in this slice.

### Manual Testing Steps:

1. New household, empty pantry: open `/` — “Pantry is empty.”, no nudge, matches (if any) still listed at score 0.
2. Add an item on `/pantry`, go Home: “Updated today”, no nudge.
3. In Supabase (or by temporarily shortening the threshold in a local-only check), set `updated_at` 8 days back — nudge + link; click through to `/pantry`.
4. Edit that item, return to `/` without a full reload — last-updated is today, nudge gone.
5. Delete all items — “Pantry is empty.”, nudge gone (MAX-on-read: no leftover date).
6. Disconnect network after first paint, switch tabs: last-updated stays; matches may toast as today.

## Performance Considerations

- Extra homepage query is one `updated_at` row, not a second full pantry list.
- Visibility refetch is two small JSON GETs (`/api/matches` + `/api/pantry/freshness`); acceptable at household scale.
- No new indexes required (`pantry_items_household_id_idx` already exists); order+limit on `updated_at` is fine for tens–low hundreds of items.

## Migration Notes

No schema change. Existing `updated_at` values are the source of truth. Households that only delete items without later edits may still look stale — accepted.

## References

- PRD: `context/foundation/prd.md` — US-03, FR-007, FR-008
- Roadmap: `context/foundation/roadmap.md` — S-05
- GitHub: https://github.com/MarcinG-DKA/co-na-obiad/issues/5
- Pantry timestamps: `context/archive/2026-09-02-pantry-management/plan.md`
- Homepage `/`: `context/archive/2026-09-04-change-homepage/plan.md`
- MatchList refetch: `src/components/matches/MatchList.tsx`
- Lessons: `context/foundation/lessons.md` (Jest for service/API)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Freshness model and API

#### Automated

- [x] 1.1 Freshness helper tests pass: `npm test` (empty, today, 1 day, 7-day boundary, relative copy, future `updated_at` clamped)
- [x] 1.2 `getPantryLastUpdatedAt` tests pass: empty → `null`, newest `updated_at` returned, DB error throws
- [x] 1.3 `GET /api/pantry/freshness` tests pass: 401, 400, 500 unconfigured, 500 on throw, `{ lastUpdatedAt: null }`, `{ lastUpdatedAt: "<iso>" }`
- [x] 1.4 Linting passes: `npm run lint`
- [x] 1.5 Full suite passes: `npm test`

#### Manual

- [x] 1.6 Authenticated `GET /api/pantry/freshness` on an empty pantry returns `{ data: { lastUpdatedAt: null } }`
- [x] 1.7 After adding or editing an item, the same GET returns that item’s `updated_at`
- [x] 1.8 Unauthenticated GET returns 401

### Phase 2: Homepage last-updated and nudge

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build passes: `npm run build`

#### Manual

- [ ] 2.4 Pantry updated today: `/` shows “Updated today”; no inaccuracy notice
- [ ] 2.5 Pantry last updated 7+ days ago: last-updated line plus inline notice and working “Review pantry” link to `/pantry`; matches still visible
- [ ] 2.6 Empty pantry: “Pantry is empty.”; no 7-day notice
- [ ] 2.7 Empty recipe library (or matches load error) + stale pantry: notice still shows
- [ ] 2.8 After editing pantry, returning to `/` (back or tab focus) updates last-updated and clears the notice without a full reload
- [ ] 2.9 Freshness load failure: “Could not load pantry status.”; match list still renders
- [ ] 2.10 `/pantry` has no last-updated line and no 7-day notice
