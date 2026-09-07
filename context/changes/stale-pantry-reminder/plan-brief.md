# Stale Pantry Reminder — Plan Brief

> Full plan: `context/changes/stale-pantry-reminder/plan.md`

## What & Why

Home cooks will trust ranked matches only if they know the pantry is current. S-05 shows when the household pantry was last updated (FR-007) and, after 7+ days without an update, a non-blocking reminder that matches may be inaccurate plus a path to review pantry (US-03, FR-008).

## Starting Point

Each `pantry_items` row has `updated_at`; nothing aggregates it or shows it. `/` SSR-seeds `MatchList` only. Returning from `/pantry` already refetches matches on visibility; freshness has no equivalent. Deletes do not bump remaining rows’ timestamps.

## Desired End State

On `/`, a relative last-updated line is always visible when the pantry has items. If that time is 7+ elapsed days old, an inline notice sits above the match list with a link to `/pantry`. An empty pantry says “Pantry is empty” and skips the nudge. Coming back from pantry updates the line/nudge without a full reload.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Last-updated source | `MAX(pantry_items.updated_at)` on read | No migration; S-01 already stored `updated_at` for this |
| Empty pantry | “Pantry is empty.”; no 7-day nudge | Empty is a clearer signal than “stale matches” |
| Surfaces | `/` only | US-03 is the household page while viewing matches |
| Nudge UI | Inline notice + `/pantry` link | Non-blocking; not a modal, toast, or layout Banner |
| Dismiss | None — stays while stale | Simplest; pantry edit is the clear action |
| Copy | Relative (“Updated today” / “N days ago”) | Fits a glance-in-the-kitchen homepage |
| Nudge vs matches | Show even if library empty or matches failed | Freshness is independent of ranking |
| Refresh | SSR + visibility refetch of `/api/pantry/freshness` | Same pattern as `MatchList`; keep last good data on refetch error |

## Scope

**In scope:** Pure 7-day/empty/relative helpers; `getPantryLastUpdatedAt`; `GET /api/pantry/freshness`; homepage island; Jest for helper/service/API.

**Out of scope:** Household column; `/pantry` freshness UI; dismiss; modal/Banner/toast-as-nudge; treating DELETE as an update; calendar-day TZ; matching API changes; Playwright; i18n.

## Architecture / Approach

Pure `pantry-freshness` module (injected `now`, 168-hour stale threshold). One `updated_at` desc/limit-1 query. JSON GET for the island. `/` loads freshness in parallel with matches; `PantryFreshness` sits above `MatchList` and refetches on `pageshow` / `visibilitychange` independently.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Freshness model and API | Helper + last-updated read + `GET /api/pantry/freshness` | 7-day boundary / empty vs stale encoded wrong |
| 2. Homepage last-updated and nudge | SSR island on `/` + visibility refetch | Refetch error wiping SSR data; notice blocked by MatchList empty state |

**Prerequisites:** S-01 (pantry `updated_at`) and S-04 (`/` is the household page) are done. No migration.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Deletes do not refresh last-updated (MAX-on-read). Clearing the pantry becomes “empty”, not “updated just now”.
- “Days” are elapsed 24h buckets, not local calendar dates — slightly less colloquial, much less TZ-buggy. Clamp negative elapsed (future `updated_at`) to “Updated today”.
- Around the exact 7-day instant, SSR and client clocks can disagree by seconds; acceptable at this scale.
- `lastUpdatedAt === null` is empty pantry only after a successful freshness load; missing Supabase or a rejected query is `loadError`, not empty.

## Success Criteria (Summary)

- Cooks on `/` always see relative last-updated (or “Pantry is empty.”).
- After 7+ days with items, a non-blocking notice + `/pantry` link appears; matches still work.
- Editing pantry and returning to `/` updates the line and clears the notice without a full reload.
