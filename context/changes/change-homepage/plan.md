# Change Homepage Implementation Plan

## Overview

Make the household ranked-list page the app homepage at `/`, with a signed-in top bar (email + Home / Pantry / Recipes / sign out) on app pages. Drop the starter Welcome landing and the `/dashboard` URL.

## Current State Analysis

- **`/` is the starter.** `src/pages/index.astro` always renders `Welcome.astro` (“10x Astro Starterr”). Same tree for anon and signed-in; only `Topbar.astro` (mounted only on Welcome) changes.
- **Household page is `/dashboard`.** `src/pages/dashboard.astro` SSR-loads invite code + `listMatches`, renders `MatchList`, in-page pantry/recipes/join links, and its own sign-out form.
- **Auth gate is prefix-based.** `PROTECTED_ROUTES` in `src/middleware.ts` uses `pathname.startsWith`. `/dashboard`, `/join`, `/pantry`, `/recipes` are gated. Adding `"/"` to that list would match every path, including `/auth/signin` (redirect loop). Called out on roadmap S-04.
- **Post-login goes to `/dashboard`.** `src/pages/api/auth/signin.ts` and `src/pages/api/households/join.ts`. Sign-out goes to `/`. Signup still goes to `/auth/confirm-email`.
- **No shared app shell.** `Layout.astro` is document chrome only. Dashboard, pantry, recipes, and join each repeat card markup and footer links. `Topbar.astro` already shows `user.email` plus Dashboard / Pantry / Recipes / sign out, but nothing except Welcome uses it.
- **No middleware tests.** Lessons in `context/foundation/lessons.md` require Jest for service/API work; this slice has no new API, but the `/` prefix footgun is the load-bearing risk and needs an extracted matcher with colocated tests.

## Desired End State

A cook can:

- Open `/` while signed in and see the current dashboard: greeting, invite code, ranked `MatchList`, tertiary “Join another household”.
- Open `/` while signed out and land on `/auth/signin` (no public Welcome, no redirect loop).
- Sign in (and join a household) and land on `/`.
- Hit `/dashboard` and get a 404 — in-app links and redirects no longer use that path.
- See a top bar on `/`, `/pantry`, `/recipes` (including `/recipes/new` and `/recipes/:id`), and `/join` with their email and Home / Pantry / Recipes / sign out. Auth pages (`/auth/*`) have no top bar.
- Not see duplicate pantry/recipes/sign-out controls on the household card; Join stays on the card.

**Verification:** `npm test`, `npm run lint`, and `npm run build` pass; Jest locks the exact-`/` vs prefix rules; browser checks guest `/`, signed-in `/`, 404 `/dashboard`, top bar presence/absence, and nav.

### Key Discoveries:

- Prefix match lives at `src/middleware.ts:10` and `src/middleware.ts:42-45` (`startsWith`).
- Roadmap S-04 risk: do not add `"/"` to `PROTECTED_ROUTES` as a prefix match (`context/foundation/roadmap.md`).
- Topbar already exists (`src/components/Topbar.astro`) and is only imported from `Welcome.astro`.
- Hardcoded `/dashboard`: sign-in, join API, Topbar, pantry, recipes index, join page. Recipe editor pages link to `/recipes`, not dashboard.
- `locals.user` is a Supabase `User`; UI only reads `email` (`src/env.d.ts`, Topbar, dashboard).

## What We're NOT Doing

- A public marketing landing or keeping `Welcome.astro`.
- A `/dashboard` redirect/alias (404 after delete).
- Display name, `user_metadata`, or a profile field — email is the identity.
- Top bar on `/auth/signin`, `/auth/signup`, or `/auth/confirm-email`.
- New shadcn nav/avatar/sheet components.
- Changing `MatchList` scoring, refetch, or API.
- S-05 stale pantry reminder.
- Playwright / component tests for Astro pages.
- OAuth.

## Implementation Approach

Two sequential phases: **move the household page and gate `/` exactly** so guests never see it and `/dashboard` is gone, then **mount Topbar on signed-in app pages** and drop duplicate in-page nav.

Extract path matching from middleware into a pure helper so Jest can prove `/` is protected and `/auth/signin` is not. Signed-in pages opt into the top bar via Layout; auth pages keep Layout as they are today.

## Critical Implementation Details

### Exact `/`, never prefix `/`

Unauthenticated access to the homepage must use `pathname === "/"` (treat trailing-slash-normalized home the same if the runtime can produce it). Prefix matching stays for `/join`, `/pantry`, `/recipes` so `/recipes/new` and `/recipes/:id` stay gated. `"/"` must not appear in the `startsWith` list.

### Sign-out must not return to `/`

After this slice, `/` is signed-in-only. Redirecting sign-out to `/` would bounce through middleware to `/auth/signin` and can flash the protected route. Sign-out success goes straight to `/auth/signin`.

### Delete `/dashboard`, do not alias it

In-app hrefs and API redirects move to `/` in the same phase as deleting `dashboard.astro`, so nothing in `src/` still points at a 404.

---

## Phase 1: Household page at `/`

### Overview

`/` is the ranked household page. Guests are sent to sign-in. `/dashboard` and Welcome are gone. Sign-in, join, and in-app “back” links target `/`.

### Changes Required:

#### 1. Protected-path helper

**File**: `src/lib/protected-routes.ts` (new), `src/lib/protected-routes.test.ts` (new)

**Intent**: Own the exact-vs-prefix rules in a pure function so middleware stays thin and the `/` footgun is locked in CI.

**Contract**: Export something like `isProtectedPath(pathname: string): boolean`. `/` is protected. `/join`, `/pantry`, `/recipes` and any path that starts with those prefixes are protected. `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/api/*`, and `/dashboard` are not protected (the last is a missing page, not a gated one). Colocated Jest covers those cases, especially “`/` must not imply `/auth/signin`”.

#### 2. Middleware

**File**: `src/middleware.ts`

**Intent**: Gate the homepage without locking the rest of the app.

**Contract**: Call the helper instead of inlining `PROTECTED_ROUTES.some(startsWith)`. Drop `/dashboard` from the prefix list. Keep resolving `locals.user` / `householdId` for all routes as today.

#### 3. Move household page to `/`

**Files**: `src/pages/index.astro`, `src/pages/dashboard.astro` (delete), `src/components/Welcome.astro` (delete)

**Intent**: Replace the starter landing with the current dashboard SSR page (invite code, `MatchList`, greeting with email). Delete Welcome so the starter hero cannot come back by accident.

**Contract**: `index.astro` contains the logic and markup now in `dashboard.astro` (same `listMatches` / household load). No `Welcome` import. `dashboard.astro` removed so `/dashboard` 404s. Do not add Topbar in this phase.

#### 4. Redirects and leftover `/dashboard` hrefs

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/households/join.ts`, `src/pages/api/auth/signout.ts`, `src/pages/pantry.astro`, `src/pages/recipes/index.astro`, `src/pages/join.astro`

**Intent**: Every in-app path to the household page is `/`. Sign-out does not use `/`.

**Contract**: Sign-in and join success redirect to `/`. Sign-out redirects to `/auth/signin`. Pantry, recipes index, and join “back” links go to `/` (wording can stay “dashboard” or become “home”; must not 404). Leave `Topbar.astro` for Phase 2 (it is unused once Welcome is deleted). Signup confirm-email unchanged.

#### 5. Docs that still say `/dashboard`

**Files**: `README.md`, `CLAUDE.md` (protected-page example), any in-repo path that documents `/dashboard` as the live household URL

**Intent**: Agent/onboarding docs match the new route.

**Contract**: Protected household page is `/`. Do not rewrite archived `context/archive/**` plans.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test` (helper: `/` protected; `/auth/signin` and `/api/auth/signin` not; `/recipes/new` protected; `/dashboard` not)
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Signed in: `/` shows ranked recipes, invite code, email greeting (former dashboard content)
- Signed out: `/` redirects to `/auth/signin` with no loop; `/auth/signin` and `/auth/signup` still render
- Sign in lands on `/`; join success lands on `/`; sign out lands on `/auth/signin`
- `/dashboard` is 404 for both signed-in and signed-out
- Welcome / “10x Astro Starterr” is gone

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Signed-in top bar

### Overview

Mount the existing Topbar on signed-in app pages only. It is the primary nav. Strip duplicate pantry/recipes/sign-out from the household card; keep Join on the card.

### Changes Required:

#### 1. Opt-in top bar on Layout

**File**: `src/layouts/Layout.astro`

**Intent**: App pages can show Topbar without putting it on auth pages (Layout default stays as today).

**Contract**: Optional prop (e.g. `showTopbar`, default `false`). When true, render `Topbar.astro` above the slot. Auth pages do not pass it.

#### 2. Topbar targets

**File**: `src/components/Topbar.astro`

**Intent**: Signed-in nav points at the new home URL; identity stays email.

**Contract**: Home (or equivalent) `href="/"` instead of `/dashboard`. Keep Pantry `/pantry`, Recipes `/recipes`, sign-out form. Show `user.email`. Unauthenticated Topbar markup can remain for completeness but app pages that mount it are already gated.

#### 3. Turn Topbar on for app pages; drop duplicate nav

**Files**: `src/pages/index.astro`, `src/pages/pantry.astro`, `src/pages/recipes/index.astro`, `src/pages/recipes/new.astro`, `src/pages/recipes/[id].astro`, `src/pages/join.astro`

**Intent**: Cooks see the same top bar on every signed-in screen. Household card is not a second nav.

**Contract**: Those pages pass `showTopbar`. Remove household-card pantry, recipes, and sign-out controls; keep “Join another household”. Remove pantry/recipes-index/join “back to dashboard” footer links (Topbar Home replaces them). Keep “Back to recipes” on new/`[id]` (section-level, not a Topbar duplicate). Do not mount Topbar on `src/pages/auth/*`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Top bar on `/`, `/pantry`, `/recipes`, `/recipes/new`, `/recipes/:id`, `/join`: email + Home + Pantry + Recipes + Sign out
- No top bar on `/auth/signin`, `/auth/signup`, `/auth/confirm-email`
- Household card has no second sign-out and no pantry/recipes links; Join remains
- Pantry and recipes list have no “back to dashboard” footer
- Home in the bar goes to `/` and shows the ranked list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- `isProtectedPath`: exact `/`; prefix `/recipes` including nested; `/join` and `/pantry`; negatives for `/auth/*` and `/api/*`; `/dashboard` not treated as protected
- No new service/API suites (no new endpoints)

### Integration Tests:

- None (no Playwright in this repo for pages)

### Manual Testing Steps:

1. Sign out (or private window): visit `/` → sign-in page, no loop; open `/auth/signup` directly
2. Sign in → `/` ranked list; `/dashboard` 404
3. Pantry → Home in top bar → ranked list; add/remove item → Home still re-ranks (existing MatchList refetch)
4. Recipes list / new / edit: top bar present; Back to recipes still works on editors
5. Join link on home card; join success → `/`
6. Sign out → `/auth/signin`; top bar absent on auth pages

## Performance Considerations

Homepage SSR cost stays the same as today’s dashboard (invite + `listMatches`). No new client bundle beyond mounting existing Topbar (Astro, not a React island).

## Migration Notes

No data migration. Bookmarks to `/dashboard` 404 by design. Update any personal notes or GitHub issue text that still say “open `/dashboard`”.

## References

- Roadmap S-04: `context/foundation/roadmap.md`
- PRD household page after login: `context/foundation/prd.md` (US-01, Business Logic)
- Matcher lesson (Jest for behaviour CI should catch): `context/foundation/lessons.md`
- Current household page: `src/pages/dashboard.astro`
- Prefix gate: `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Household page at `/`

#### Automated

- [x] 1.1 Unit tests pass: `npm test` (helper: `/` protected; `/auth/signin` and `/api/auth/signin` not; `/recipes/new` protected; `/dashboard` not) — 8508d33
- [x] 1.2 Linting passes: `npm run lint` — 8508d33
- [x] 1.3 Production build passes: `npm run build` — 8508d33

#### Manual

- [x] 1.4 Signed in: `/` shows ranked recipes, invite code, email greeting (former dashboard content) — 8508d33
- [x] 1.5 Signed out: `/` redirects to `/auth/signin` with no loop; `/auth/signin` and `/auth/signup` still render — 8508d33
- [x] 1.6 Sign in lands on `/`; join success lands on `/`; sign out lands on `/auth/signin` — 8508d33
- [x] 1.7 `/dashboard` is 404 for both signed-in and signed-out — 8508d33
- [x] 1.8 Welcome / “10x Astro Starterr” is gone — 8508d33

### Phase 2: Signed-in top bar

#### Automated

- [x] 2.1 Unit tests pass: `npm test`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Production build passes: `npm run build`

#### Manual

- [x] 2.4 Top bar on `/`, `/pantry`, `/recipes`, `/recipes/new`, `/recipes/:id`, `/join`: email + Home + Pantry + Recipes + Sign out
- [x] 2.5 No top bar on `/auth/signin`, `/auth/signup`, `/auth/confirm-email`
- [x] 2.6 Household card has no second sign-out and no pantry/recipes links; Join remains
- [x] 2.7 Pantry and recipes list have no “back to dashboard” footer
- [x] 2.8 Home in the bar goes to `/` and shows the ranked list
