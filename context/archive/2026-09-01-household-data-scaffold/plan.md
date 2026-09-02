# Household data model and RLS policies — Implementation Plan

## Overview

Land the household data model so every later slice can isolate pantry and recipes by household. This change creates `households` and `household_members` (many-to-many), enforces RLS, auto-assigns a household on signup via a Postgres trigger, backfills existing Auth users, and ships a minimal invite-code join flow plus a `current_household_id` cookie. There is no pantry, no recipe tables, and no household switcher.

## Current State Analysis

Auth is cookie-based Supabase SSR only. `createClient` in `src/lib/supabase.ts` is untyped and returns `null` when env is missing. Middleware (`src/middleware.ts`) sets `locals.user` from `auth.getUser()` and protects `/dashboard`. Signup (`src/pages/api/auth/signup.ts`) calls `signUp` and redirects to `/auth/confirm-email` — no app-row insert, so a household cannot be created only in that route.

`supabase/migrations/` does not exist. There are no generated `Database` types, no `src/types.ts`, no `src/lib/services/`, and no `supabase.from()` calls. `config.toml` enables migrations and references `./seed.sql`, which is also missing.

PRD Access Control requires household sharing (many users, one pantry/library) and NFR isolation (no cross-household leakage). Planning decisions: a user may belong to many households; invites are shareable codes; any member may share the code (no owner role); current household is a session cookie defaulting to the oldest membership; RLS leakage is not proven in this change (deferred to S-01).

## Desired End State

After signup (or backfill), every Auth user has at least one household and membership. A logged-in user has `Astro.locals.householdId` set to a household they belong to. Dashboard shows that household's invite code. A second logged-in user can POST a code on `/join` and become a member; the cookie switches to the joined household. Authenticated clients cannot read or write another household's rows through PostgREST. Pantry/recipe tables do not exist yet.

### Key Discoveries:

- Signup never establishes a session before confirm-email (`src/pages/api/auth/signup.ts:13–19`) — household creation must be a trigger on `auth.users`, not an insert in the signup route.
- Redeeming an invite cannot use a normal `INSERT` policy on `household_members` ("must already be a member") — join must go through a `SECURITY DEFINER` RPC.
- AGENTS.md requires `prerender = false` and Zod on API routes; existing auth routes do neither and Zod is not in `package.json`. New routes follow AGENTS.md; do not retrofit auth in this change.
- No test runner is configured. Per planning, isolation is not proven here; S-01 is the first UI that can show leakage.

## What We're NOT Doing

- Pantry, recipes, matching, or stale-pantry reminder (S-01–S-04)
- Household switcher UI, rename, leave, delete, or merge
- Owner/admin roles, member removal, or transfer
- Email invites or transactional email
- Creating extra households from the UI (only the signup trigger plus joining via code)
- Automated RLS/pgTAP suite
- OAuth providers (PRD lists them; existing app is email/password only)
- Retrofitting Zod/`prerender` onto existing auth routes
- Applying the migration to hosted production unless the implementer already has `supabase link` from the deployment change

## Implementation Approach

One SQL migration owns schema, RLS, trigger, backfill, and `join_household(code)`. The app then consumes that contract: typed client, middleware cookie, a thin service, and the smallest join UX on the existing dashboard plus a new `/join` page.

Membership is many-to-many (`household_members` unique on `(household_id, user_id)` only). Every signup still gets a personal household; joining another household adds a second membership. Empty extra households are tolerated; no cleanup in this change.

## Critical Implementation Details

**Timing & lifecycle.** The trigger runs on `auth.users` INSERT (signup), before any cookie session. The current-household cookie is set on the first authenticated request in middleware (and again after a successful join). Do not set it in the signup route.

**Join RPC.** `join_household(p_code text)` must be `SECURITY DEFINER`, `auth.uid()`-gated, insert membership if the code matches, and return `household_id`. Do not add a policy that lets non-members `SELECT` households by `invite_code` (enumerable leak). Invite codes must be unguessable (random, unique).

**State sequencing.** After join, set `current_household_id` to the joined household even if an older membership exists — otherwise the user would not see the household they just joined.

## Phase 1: Schema, RLS, trigger, types

### Overview

Create the first application schema and generate TypeScript types so the rest of the app can query households with a typed client.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/YYYYMMDDHHmmss_household_data_scaffold.sql` (timestamp at apply time, AGENTS.md format)

**Intent**: Introduce `households` and `household_members`, lock them down with RLS, auto-create a household+membership for every new Auth user, backfill existing Auth users, and expose a definer join function.

**Contract**:
- `households`: `id uuid PK`, `invite_code text UNIQUE NOT NULL`, `created_at timestamptz NOT NULL`
- `household_members`: `household_id` FK, `user_id uuid` references `auth.users(id)` ON DELETE CASCADE, `created_at`; unique `(household_id, user_id)`
- RLS enabled on both tables; per-operation policies for `authenticated` only (no `anon` access)
- `households` SELECT: caller is a member. No authenticated INSERT/UPDATE/DELETE on `households` (writes go through trigger/definer)
- `household_members` SELECT: caller is a member of that `household_id`. No direct INSERT for `authenticated` (join RPC only)
- Trigger `on auth.users` AFTER INSERT: insert household with unguessable `invite_code`, insert membership for `NEW.id`
- Backfill: for each `auth.users` row with no membership, same as the trigger
- `join_household(p_code text) returns uuid`: `SECURITY DEFINER`, set `search_path`, require `auth.uid()`, insert membership (ignore duplicate), return household id; raise on unknown code
- Grant `execute` on `join_household` to `authenticated`

#### 2. Generated types and typed client

**File**: `src/db/database.types.ts` (generated, not hand-written)

**Intent**: Give the Supabase client a `Database` generic so later slices do not query untyped tables.

**Contract**: Generate with `npx supabase gen types typescript` against the DB that has this migration applied. Wire `createServerClient<Database>` in `src/lib/supabase.ts`. Add an npm script `db:types` that regenerates the file. Do not commit a stub that lies about tables.

### Success Criteria:

#### Automated Verification:

- Migration file exists under `supabase/migrations/` with the AGENTS.md name shape
- `npx supabase db reset` (or `db push` if already linked) applies without error when local/hosted Supabase is running
- `src/db/database.types.ts` contains `households`, `household_members`, and `join_household`
- `npm run lint` passes
- `npm run build` passes (requires `SUPABASE_URL` / `SUPABASE_KEY` as today)

#### Manual Verification:

- In the SQL editor (or `psql`): a newly created Auth user has exactly one `households` row and one `household_members` row
- An Auth user that existed before the migration also has a household after backfill
- Calling `join_household` with a bogus code errors; with a valid code as a second user inserts a membership

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Current-household cookie and helpers

### Overview

Resolve which household the request is acting on, and expose it to pages as `locals.householdId` so S-01 can query without reinventing membership.

### Changes Required:

#### 1. Locals typing

**File**: `src/env.d.ts`

**Intent**: Pages and API routes read the active household without a second membership lookup.

**Contract**: `App.Locals` gains `householdId: string | null` alongside existing `user`.

#### 2. Household service

**File**: `src/lib/services/household.ts`

**Intent**: Centralize membership reads and cookie name so middleware and the join route do not duplicate queries.

**Contract**: Export a constant cookie name (`current_household_id`), `listMemberships(supabase, userId)`, and `resolveHouseholdId(memberships, cookieValue)` — cookie wins if it is one of the user's household ids, otherwise the oldest membership by `created_at`. Cookie options: `path=/`, `httpOnly`, `sameSite=lax`, `secure` when the request is HTTPS.

#### 3. Middleware

**File**: `src/middleware.ts`

**Intent**: On every authenticated request, ensure a valid current-household cookie and populate `locals.householdId`.

**Contract**: After `getUser`, if there is no user, `householdId = null`. If there is a user, load memberships, resolve id, `cookies.set` when the resolved id differs from the incoming cookie, set `locals.householdId`. If the user has no memberships (should not happen after Phase 1), `householdId = null` and do not invent a household in middleware.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Typecheck: `Astro.locals.householdId` is valid on a page (e.g. dashboard compiles)

#### Manual Verification:

- Sign in as a backfilled user: after load, cookie `current_household_id` is present and matches their (only) household
- Tampering the cookie to a random UUID is ignored; middleware resets to a membership the user actually has

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Invite code join flow

### Overview

Let a second person join a household by entering a shareable code. Any member can copy the code from the dashboard. Joining switches the current-household cookie to that household.

### Changes Required:

#### 1. Join API

**File**: `src/pages/api/households/join.ts`

**Intent**: Authenticated POST redeems a code via the RPC and updates the current-household cookie.

**Contract**: `export const prerender = false`. `POST` only. Zod-validate `code` (non-empty string); add `zod` to dependencies. Require `locals.user`; otherwise redirect to `/auth/signin`. Call `supabase.rpc('join_household', { p_code })`. On success, set `current_household_id` to the returned id and redirect `/dashboard`. On failure, redirect `/join?error=...` (same error-query pattern as `src/pages/api/auth/signup.ts`).

#### 2. Join page

**File**: `src/pages/join.astro`

**Intent**: Logged-in users paste a code. This is the invite/join UX; not a household settings screen.

**Contract**: Add `/join` to `PROTECTED_ROUTES`. Form `POST`s to `/api/households/join`. Show `error` query param if present. Keep layout consistent with `src/pages/dashboard.astro`.

#### 3. Dashboard invite code

**File**: `src/pages/dashboard.astro`

**Intent**: The current household's invite code is visible so a member can share it. Link to `/join` for redeeming someone else's code.

**Contract**: Read `locals.householdId`; load that row's `invite_code` with the user-scoped client (RLS). If `householdId` is null, show a short "no household" message instead of a code. Do not add rename, member lists, or a switcher.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- `/join` is listed in `PROTECTED_ROUTES` (unauthenticated request redirects to sign-in)

#### Manual Verification:

- User A on dashboard sees a non-empty invite code
- User B, signed in, submits that code on `/join` and lands on dashboard with B's cookie set to A's household
- Submitting an unknown code returns to `/join` with an error, no membership inserted
- User B still has their original personal household in `household_members` (second membership, not a replace)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None required — no test runner in the project. Prefer keeping `resolveHouseholdId` small and pure so a later test harness can cover cookie-vs-oldest without I/O.

### Integration Tests:

- None in CI. Phase 1 manual SQL covers trigger, backfill, and RPC. Phase 3 manual covers join.

### Manual Testing Steps:

1. `npx supabase start` (Docker) if local DB is not running; apply Phase 1 migration; confirm backfill for any existing users
2. Sign up a new user; after confirm/login, dashboard shows an invite code and cookie is set
3. Sign up a second user; join with the first user's code; confirm two memberships for user B and cookie points at A's household
4. Do not treat cross-household pantry leakage as in-scope for this change (no pantry table). Wrong RLS will surface in S-01.

## Performance Considerations

Household lists are tiny (PRD: small user scale). Middleware does one membership query per authenticated request — acceptable. Do not cache memberships in a store. Invite codes are unique-indexed for RPC lookup.

## Migration Notes

- Local: `npx supabase db reset` or `migration up` after placing the SQL file. `config.toml` seed path `./seed.sql` is missing; either add an empty `supabase/seed.sql` so reset does not fail, or leave seed disabled — if reset errors on missing seed, add an empty file (no household seed data).
- Hosted: `npx supabase db push` when the project is linked (see `context/changes/deployment/deployment-plan.md` §0.5).
- Rollback: drop trigger, function, tables in a follow-up migration. Do not `db reset` hosted data.
- Existing Auth users are backfilled in the same migration; they should not need to re-register.

## References

- Roadmap F-01: `context/foundation/roadmap.md`
- PRD Access Control / NFR isolation: `context/foundation/prd.md`
- GitHub: https://github.com/MarcinG-DKA/co-na-obiad/issues/1
- Auth client: `src/lib/supabase.ts`
- Middleware: `src/middleware.ts`
- Signup (no session): `src/pages/api/auth/signup.ts`
- Deploy migrations: `context/changes/deployment/deployment-plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, trigger, types

#### Automated

- [x] 1.1 Migration file exists under supabase/migrations/ with the AGENTS.md name shape — 3888bff
- [x] 1.2 npx supabase db reset (or db push) applies without error when Supabase is running — 3888bff
- [x] 1.3 src/db/database.types.ts contains households, household_members, and join_household — 3888bff
- [x] 1.4 npm run lint passes — 3888bff
- [x] 1.5 npm run build passes — 3888bff

#### Manual

- [x] 1.6 New Auth user has exactly one household and one membership — 3888bff
- [x] 1.7 Pre-existing Auth user is backfilled with a household — 3888bff
- [x] 1.8 join_household rejects bogus codes and accepts a valid code for a second user — 3888bff

### Phase 2: Current-household cookie and helpers

#### Automated

- [x] 2.1 npm run lint passes — 24142c4
- [x] 2.2 npm run build passes — 24142c4
- [x] 2.3 Astro.locals.householdId typechecks on a page — 24142c4

#### Manual

- [x] 2.4 Sign-in sets current_household_id to the user's household — 24142c4
- [x] 2.5 Tampered cookie is ignored and reset to a real membership — 24142c4

### Phase 3: Invite code join flow

#### Automated

- [x] 3.1 npm run lint passes — 40f651f
- [x] 3.2 npm run build passes — 40f651f
- [x] 3.3 /join is in PROTECTED_ROUTES (unauthenticated redirect to sign-in) — 40f651f

#### Manual

- [x] 3.4 User A dashboard shows a non-empty invite code — 40f651f
- [x] 3.5 User B joins with that code; cookie points at A's household — 40f651f
- [x] 3.6 Unknown code returns to /join with an error and no membership — 40f651f
- [x] 3.7 User B still has their original personal household membership — 40f651f
