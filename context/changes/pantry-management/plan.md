# Pantry Management Implementation Plan

## Overview

Add household pantry CRUD — the first app-domain data layer on top of the F-01 household scaffold. Users can view, add, edit, and remove pantry items scoped to their current household via a dedicated `/pantry` page with a React island for fast, in-kitchen editing. This slice covers FR-002 (see pantry contents), FR-003 (modify pantry contents), and US-02 (edit updates matching — data side only; matching UI is S-03).

## Current State Analysis

The codebase has:

- **Database:** `households` + `household_members` with RLS via `is_household_member()`. No app-domain tables exist.
- **Middleware:** resolves `Astro.locals.user` and `Astro.locals.householdId` from cookie + memberships on every authenticated request.
- **Service layer:** `src/lib/services/household.ts` — typed Supabase client (`SupabaseClient<Database>`), throws on DB errors, pure helper functions.
- **API routes:** PRG form POST pattern only (`src/pages/api/households/join.ts`). No JSON API, no client-side `fetch()` anywhere.
- **UI:** Cosmic glassmorphism theme, shadcn `button` only, `FormField` + `SubmitButton` + `ServerError` reusable components. All pages server-rendered; React islands for auth forms only.
- **Generated types:** `src/db/database.types.ts` from `npm run db:types` (linked remote).

### Key Discoveries:

- `is_household_member(p_household_id)` is the existing RLS helper — reuse for all pantry policies, no new membership check needed.
- The household scaffold uses definer RPCs for writes; pantry uses direct per-operation RLS policies (simpler, appropriate for standard CRUD).
- Impl-review lesson F2: distinguish DB errors from empty state in both service and UI layers.
- Impl-review lesson F1: revoke definer grants by default on any new SQL functions.
- `updated_at` column goes in now (FR-007 for S-04); no reminder UI in this slice.

## Desired End State

A logged-in user navigates to `/pantry` (linked from the dashboard) and sees the list of pantry items for their current household. They can:
- Add a new item (name required; quantity and unit optional) — it appears instantly in the list (optimistic update).
- Edit an existing item's name, quantity, or unit inline.
- Remove an item with a confirmation step.
- See a toast notification if any operation fails, with the optimistic change reverted.

The pantry is scoped to the user's current household via RLS. Users in different households cannot see or modify each other's pantry items. This is the first real cross-household isolation proof point.

**Verification:** lint passes (`npm run lint`), build succeeds (`npm run build`), migration applies cleanly, generated types include `pantry_items`, manual SQL isolation test confirms cross-household data separation, pantry CRUD works end-to-end in the browser.

## What We're NOT Doing

- **Recipe management** — S-02 scope.
- **Pantry-recipe matching** — S-03 scope.
- **Stale pantry reminder UI** (7-day nudge) — S-04. We add `updated_at` on the table but no reminder logic or display.
- **Ingredient normalization / autocomplete** — free-text only; revisit if S-03 matching quality suffers.
- **Ingredient categories or expiry dates** — deferred beyond MVP.
- **Household switcher / leave / delete** — not in M-1 scope.
- **Retrofitting auth routes** with Zod or `prerender = false` — deferred from F-01, still out of scope.
- **pgTAP or automated RLS test suite** — manual SQL verification only.
- **`src/types.ts` shared DTOs** — pantry types stay in the service file for now; extract to `src/types.ts` when S-02 introduces cross-feature type sharing.

## Implementation Approach

Three sequential phases: **schema → service + API → UI**. Each phase is independently verifiable. Phase 2 introduces the first **JSON API route convention** — API endpoints return `{ data, error }` JSON instead of redirects, enabling the React island to call them via `fetch()` with optimistic updates. This pattern becomes the standard for S-02 through S-04.

## Critical Implementation Details

### RLS policy pattern

Pantry policies use `is_household_member(household_id)` in both `USING` (reads/updates/deletes) and `WITH CHECK` (inserts/updates) clauses. The `WITH CHECK` on INSERT is critical — it prevents a client from inserting items into a household they don't belong to, even though `household_id` comes from the trusted `Astro.locals.householdId`. Belt-and-suspenders: the API route uses `locals.householdId` as the value, and RLS independently validates membership.

### JSON API convention (new)

The existing codebase uses redirect-based form POST responses. Pantry introduces JSON responses for fetch-based React islands:
- Success: `new Response(JSON.stringify({ data: ... }), { status: 200 })`
- Validation error: `new Response(JSON.stringify({ error: "..." }), { status: 400 })`
- Auth/permission error: `new Response(JSON.stringify({ error: "..." }), { status: 401 })`
- Server error: `new Response(JSON.stringify({ error: "..." }), { status: 500 })`

All API routes still export `const prerender = false` and validate with Zod.

---

## Phase 1: Schema, RLS, and Types

### Overview

Create the `pantry_items` table with per-operation RLS policies, an auto-updating `updated_at` trigger, and regenerate TypeScript types.

### Changes Required:

#### 1. Pantry migration

**File**: `supabase/migrations/<timestamp>_pantry_items.sql`

**Intent**: Create the `pantry_items` table scoped to households, with RLS policies for all four operations, and an `updated_at` auto-trigger.

**Contract**:
- Table `pantry_items`: `id` (uuid PK, default `gen_random_uuid()`), `household_id` (uuid FK → `households`, NOT NULL), `name` (text NOT NULL), `quantity` (numeric, nullable), `unit` (text, nullable), `created_at` (timestamptz, default `now()`), `updated_at` (timestamptz, default `now()`).
- Index on `household_id` for RLS performance.
- RLS enabled. Four policies for `authenticated`:
  - SELECT: `USING (public.is_household_member(household_id))`
  - INSERT: `WITH CHECK (public.is_household_member(household_id))`
  - UPDATE: `USING (public.is_household_member(household_id)) WITH CHECK (public.is_household_member(household_id))`
  - DELETE: `USING (public.is_household_member(household_id))`
- Trigger function `update_updated_at()` (or reuse if exists): sets `NEW.updated_at = now()` on UPDATE. Trigger `pantry_items_updated_at` BEFORE UPDATE.

#### 2. Regenerate types

**File**: `src/db/database.types.ts`

**Intent**: Reflect the new `pantry_items` table in TypeScript types.

**Contract**: Run `npm run db:types` after migration is pushed. The generated file includes `Tables<"pantry_items">` and related insert/update types.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly: `npx supabase db push --linked`
- Types regenerate without error: `npm run db:types`
- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- In Supabase dashboard (SQL editor), insert a pantry item for an existing household as the household's owner — succeeds.
- Attempt to SELECT that item as a user who is NOT a member of that household — returns empty (RLS blocks).
- Attempt to INSERT an item with a `household_id` the user doesn't belong to — rejected by WITH CHECK.
- UPDATE an item, verify `updated_at` auto-updates.
- DELETE an item as a member — succeeds. Attempt DELETE as a non-member — no rows affected.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Service Layer and JSON API Routes

### Overview

Create a pantry service with typed CRUD operations and four API routes returning JSON. This introduces the fetch-based JSON API pattern to the codebase.

### Changes Required:

#### 1. Pantry service

**File**: `src/lib/services/pantry.ts`

**Intent**: Encapsulate all pantry data access in a typed service module following the `household.ts` pattern.

**Contract**:
- Exports: `listPantryItems(supabase, householdId)` → `PantryItem[]`, `addPantryItem(supabase, householdId, input)` → `PantryItem`, `updatePantryItem(supabase, itemId, householdId, input)` → `PantryItem`, `removePantryItem(supabase, itemId, householdId)` → `void`.
- `PantryItem` interface exported from this file: `{ id, household_id, name, quantity, unit, created_at, updated_at }`.
- All functions throw on Supabase errors (caller handles). List returns `[]` only when there are genuinely no items.
- List orders by `created_at` ascending (oldest first — stable order for the UI).
- Update and remove scope to both `id` and `household_id` (defense-in-depth alongside RLS).

#### 2. API route: list pantry items

**File**: `src/pages/api/pantry/index.ts`

**Intent**: GET endpoint returning the current household's pantry items as JSON.

**Contract**:
- Export `GET` + `const prerender = false`.
- Auth guard: `!context.locals.user` → 401 JSON.
- Null guard: `!context.locals.householdId` → 400 JSON (`"No household"`).
- Calls `listPantryItems(supabase, householdId)`.
- Returns `{ data: PantryItem[] }` on success, `{ error: string }` on failure.

#### 3. API route: add pantry item

**File**: `src/pages/api/pantry/index.ts`

**Intent**: POST endpoint to create a new pantry item in the current household.

**Contract**:
- Export `POST` (same file as GET).
- Auth + household guards (same as GET).
- Zod schema: `{ name: z.string().trim().min(1).max(200), quantity: z.number().positive().nullable().optional(), unit: z.string().trim().max(50).nullable().optional() }`.
- Parses `request.json()`.
- Calls `addPantryItem(supabase, householdId, parsed.data)`.
- Returns `{ data: PantryItem }` (201) on success.

#### 4. API route: update pantry item

**File**: `src/pages/api/pantry/[id].ts`

**Intent**: PATCH endpoint to update a pantry item's name, quantity, or unit.

**Contract**:
- Export `PATCH` + `const prerender = false`.
- Auth + household guards.
- Reads `context.params.id` as the item UUID.
- Zod schema: partial of the add schema (at least one field required).
- Calls `updatePantryItem(supabase, id, householdId, parsed.data)`.
- Returns `{ data: PantryItem }` on success.

#### 5. API route: remove pantry item

**File**: `src/pages/api/pantry/[id].ts`

**Intent**: DELETE endpoint to remove a pantry item.

**Contract**:
- Export `DELETE` (same file as PATCH).
- Auth + household guards.
- Calls `removePantryItem(supabase, id, householdId)`.
- Returns `{ data: null }` (200) on success.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- TypeScript has no errors in new files

#### Manual Verification:

- `curl` or browser devtools: `GET /api/pantry` returns `{ data: [] }` for a household with no items.
- `POST /api/pantry` with `{ "name": "Milk" }` returns 201 with the new item.
- `POST /api/pantry` with empty body returns 400 with validation error.
- `PATCH /api/pantry/<id>` with `{ "name": "Whole Milk", "quantity": 2, "unit": "L" }` returns updated item.
- `DELETE /api/pantry/<id>` returns success; subsequent GET no longer includes the item.
- Unauthenticated requests return 401.
- Requests without a household return 400.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Pantry UI

### Overview

Create the `/pantry` page with a React island for interactive pantry management. Install needed shadcn components. Add navigation links from dashboard and topbar.

### Changes Required:

#### 1. Install shadcn components

**Intent**: Add UI primitives needed for the pantry interface.

**Contract**: `npx shadcn@latest add input sonner` — installs `Input` component and `Sonner` toast library. These land in `src/components/ui/`.

#### 2. Pantry React island

**File**: `src/components/pantry/PantryManager.tsx`

**Intent**: Interactive React island that renders the pantry list and handles add/edit/remove with optimistic updates and toast error feedback.

**Contract**:
- Default export: `PantryManager({ initialItems: PantryItem[] })`.
- Props: `initialItems` — server-rendered list passed from Astro.
- Local state: `items` (optimistic), `isAdding` (loading flag).
- Fetches `/api/pantry` for mutations (POST, PATCH, DELETE) — not for reads (SSR handles initial load).
- Add: inline form at top with name input (required), optional quantity + unit fields. On submit: optimistic insert with temp id → POST → replace with real item or revert + toast on error.
- Edit: click item to toggle inline edit mode. On save: optimistic update → PATCH → confirm or revert + toast.
- Remove: click delete icon → optimistic remove → DELETE → confirm or revert + toast.
- Toast: use `sonner`'s `toast.error("message")` for failed operations.
- Styling: cosmic glass theme (`bg-white/10`, `border-white/20`, purple accents), lucide icons, `cn()` for class merging.

#### 3. Pantry page

**File**: `src/pages/pantry.astro`

**Intent**: Server-rendered page that loads pantry items and renders the React island.

**Contract**:
- Uses `Layout` with `title="Pantry"`.
- Reads `Astro.locals.householdId` + creates Supabase client.
- Calls `listPantryItems(supabase, householdId)` in frontmatter.
- Error handling: if service throws, render an error state (not an empty list).
- Renders `<PantryManager initialItems={items} client:load />`.
- Cosmic glass card layout matching dashboard.

#### 4. Add /pantry to protected routes

**File**: `src/middleware.ts`

**Intent**: Protect the pantry route from unauthenticated access.

**Contract**: Add `"/pantry"` to the `PROTECTED_ROUTES` array.

#### 5. Add Toaster to layout

**File**: `src/layouts/Layout.astro`

**Intent**: Mount the Sonner toast container globally so toasts render from any React island.

**Contract**: Import and render `<Toaster client:load />` from `sonner` (or a thin Astro wrapper) inside the layout, positioned at a corner. Since Sonner needs React, wrap it in a small React component or use `@astrojs/react` inline.

#### 6. Dashboard link to pantry

**File**: `src/pages/dashboard.astro`

**Intent**: Add a navigation link from the dashboard to the pantry page.

**Contract**: Add an `<a href="/pantry">` link in the dashboard card, styled consistently with the existing "Join another household" link.

#### 7. Topbar pantry link

**File**: `src/components/Topbar.astro`

**Intent**: Add a pantry link to the authenticated nav section.

**Contract**: Add `<a href="/pantry">Pantry</a>` alongside the existing Dashboard link in the authenticated user section.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- No TypeScript errors

#### Manual Verification:

- Navigate to `/pantry` while logged in — see empty pantry state.
- Add an item ("Milk") — appears instantly in the list.
- Add an item with quantity and unit ("Eggs", 12, "pcs") — displays correctly.
- Edit the item name — updates inline without page reload.
- Remove an item — disappears with no reload.
- Disconnect network (devtools) and try to add — see toast error, item reverts.
- Log in as a different user in a different household — see empty pantry (not the first user's items).
- Navigate from dashboard → pantry via link.
- Navigate from topbar → pantry via link.
- `/pantry` redirects to `/auth/signin` when not logged in.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No test runner configured. Pure functions in `pantry.ts` service (if any) can be extracted for future testing. Keep service functions small and deterministic where possible.

### Integration Tests:

Deferred — no test infrastructure. The JSON API routes are testable via `curl` for now.

### Manual Testing Steps:

1. Full CRUD cycle: add → edit → remove items, verify list updates correctly.
2. Cross-household isolation: User A adds items → User B (different household) sees empty pantry.
3. Error states: kill Supabase connection → verify toast errors, no data loss.
4. Empty state: new user with no items sees appropriate empty state message.
5. Edge cases: very long item name (200 chars), zero quantity, empty unit string.
6. Auth: unauthenticated user redirected from `/pantry`.
7. No household: user with `householdId = null` sees appropriate message (edge case after account issues).

## Performance Considerations

- Pantry list is server-rendered on initial load (no client-side fetch for first paint).
- Mutations are optimistic — UI updates before the server confirms, keeping the "standing in front of the fridge" flow fast.
- RLS `is_household_member()` uses an index on `household_members(user_id)` (created in F-01).
- `pantry_items(household_id)` index covers the WHERE clause on list queries.
- No pagination needed for MVP — household pantries are expected to have tens to low hundreds of items.

## Migration Notes

- Migration goes to the linked hosted project: `npx supabase db push --linked`.
- Types regenerated with `npm run db:types` (uses `--linked`).
- The `update_updated_at()` trigger function may be reusable by S-02 (recipe table); define it generically.
- No data migration needed — no pre-existing pantry data.

## References

- Prior work: `context/archive/2026-09-01-household-data-scaffold/plan.md`
- Impl-review findings: `context/archive/2026-09-01-household-data-scaffold/reviews/impl-review.md`
- PRD: `context/foundation/prd.md` — FR-002, FR-003, US-02
- Roadmap: `context/foundation/roadmap.md` — S-01
- API route pattern: `src/pages/api/households/join.ts`
- Service layer pattern: `src/lib/services/household.ts`
- RLS helper: `is_household_member()` in `supabase/migrations/20260901141851_household_data_scaffold.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema, RLS, and types

#### Automated

- [x] 1.1 Migration applies cleanly — 3658761
- [x] 1.2 Types regenerate without error — 3658761
- [x] 1.3 Lint passes — 3658761
- [x] 1.4 Build succeeds — 3658761

#### Manual

- [x] 1.5 Insert item as household member succeeds — 3658761
- [x] 1.6 SELECT as non-member returns empty — 3658761
- [x] 1.7 INSERT with wrong household_id rejected — 3658761
- [x] 1.8 UPDATE triggers updated_at auto-update — 3658761
- [x] 1.9 DELETE as member succeeds; DELETE as non-member no-op — 3658761

### Phase 2: Service layer and JSON API routes

#### Automated

- [x] 2.1 Lint passes — 1ed39a3
- [x] 2.2 Build succeeds — 1ed39a3
- [x] 2.3 No TypeScript errors in new files — 1ed39a3

#### Manual

- [x] 2.4 GET /api/pantry returns empty array for new household — 1ed39a3
- [x] 2.5 POST /api/pantry creates item and returns 201 — 1ed39a3
- [x] 2.6 POST with invalid body returns 400 — 1ed39a3
- [x] 2.7 PATCH /api/pantry/:id updates item — 1ed39a3
- [x] 2.8 DELETE /api/pantry/:id removes item — 1ed39a3
- [x] 2.9 Unauthenticated requests return 401 — 1ed39a3
- [x] 2.10 No-household requests return 400 — 1ed39a3

### Phase 3: Pantry UI

#### Automated

- [x] 3.1 Lint passes
- [x] 3.2 Build succeeds
- [x] 3.3 No TypeScript errors

#### Manual

- [x] 3.4 Empty pantry state renders correctly
- [x] 3.5 Add item appears instantly (optimistic)
- [x] 3.6 Add item with quantity and unit displays correctly
- [x] 3.7 Edit item updates inline
- [x] 3.8 Remove item disappears without reload
- [x] 3.9 Network error shows toast and reverts
- [x] 3.10 Cross-household isolation confirmed in browser
- [x] 3.11 Dashboard and topbar link to /pantry
- [x] 3.12 /pantry redirects unauthenticated users
