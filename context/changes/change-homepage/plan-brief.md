# Change Homepage — Plan Brief

> Full plan: `context/changes/change-homepage/plan.md`

## What & Why

The household ranked-list page still lives at `/dashboard` while `/` is the 10x starter landing. S-04 makes `/` the household homepage and puts a signed-in top bar (email + navigation) on app pages so later slices (S-05 reminder) mount on the real home.

## Starting Point

`index.astro` always renders `Welcome.astro`. Dashboard SSR + `MatchList` sit on `/dashboard`. Middleware protects routes with `pathname.startsWith`, so `"/"` must never join that list. `Topbar.astro` already shows email and Dashboard/Pantry/Recipes/sign out, but only on Welcome.

## Desired End State

Signed-in cooks open `/` and see today’s dashboard (ranked recipes, invite code). Guests hitting `/` go to `/auth/signin`. `/dashboard` 404s. App pages share a top bar; auth pages do not. Pantry/recipes/sign-out are not duplicated on the household card; Join stays there.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Guest `/` | Redirect to `/auth/signin` | Homepage is the household page, not a marketing landing |
| `/dashboard` | Delete (404), rewrite links | No alias; one canonical URL |
| Auth gate | Exact `pathname === "/"` plus existing prefixes | `startsWith("/")` would lock `/auth/*` |
| Top bar | App pages only, not `/auth/*` | Nav where cooks work; auth forms stay clean |
| Identity | `user.email` | No display-name field; email/password signup |
| Duplicate nav | Topbar canonical; keep Join on the card | One sign-out and primary nav |
| Welcome | Delete | S-04 replaces the starter landing |

## Scope

**In scope:** Move dashboard SSR to `/`; exact `/` gate; delete Welcome + `dashboard.astro`; retarget sign-in/join/sign-out and in-app hrefs; Jest for the matcher; Topbar on signed-in app pages; drop duplicate card/footer nav.

**Out of scope:** Public landing, `/dashboard` redirect, display name, Topbar on auth, MatchList/API changes, S-05 reminder, Playwright, OAuth.

## Architecture / Approach

Extract `isProtectedPath` (exact `/`, prefix `/join` `/pantry` `/recipes`). `index.astro` takes over dashboard load + `MatchList`. Layout gains opt-in `showTopbar` (default off). Sign-out redirects to `/auth/signin` so `/` is never hit unauthenticated.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Household page at `/` | Home is the ranked page; guests → sign-in; `/dashboard` gone | Prefix-matching `/` → auth redirect loop |
| 2. Signed-in top bar | Topbar on app pages; duplicates removed | Forgetting nested `/recipes/:id` or leaking bar onto auth |

**Prerequisites:** S-03 archived (ranked list already on dashboard). F-01 done.
**Estimated effort:** ~2 sessions across 2 phases.

## Open Risks & Assumptions

- Bookmarks to `/dashboard` 404 by choice.
- Email stands in for roadmap “name”.
- Sign-out goes to `/auth/signin` to avoid a bounce off protected `/`.

## Success Criteria (Summary)

- Signed-in `/` is the former dashboard; signed-out `/` is sign-in, no loop.
- `/dashboard` 404s; sign-in and join land on `/`.
- Top bar (email + Home/Pantry/Recipes/sign out) on app pages only.
