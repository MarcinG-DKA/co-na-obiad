# Isolation around APIs — Plan Brief

> Full plan: `context/changes/testing-isolation-around-apis/plan.md`
> Research: `context/changes/testing-isolation-around-apis/research.md`

## What & Why

Rollout Phase 2 of `context/foundation/test-plan.md`: prove a member of household A cannot read or write B’s pantry, recipes, or match inputs (Risk #2); prove PATCH/DELETE with another household’s id is 404 and create ignores a client household id (Risk #4); prove the next ranked-list load after a pantry or recipe write shows new scores/missing names (Risk #5). Existing green tests are happy-path as `hh-1` with mocked services and filter-ignoring builders.

## Starting Point

Vitest node, colocated `*.test.ts`, API tests mock `@/lib/supabase` and services. `resolveHouseholdId` is untested. Ranking is recomputed on read (`listMatches`); it is not stored. No e2e runner. RLS exists in SQL and cannot run here.

## Desired End State

`npm test` fails if a spoofed household cookie is accepted, if A’s reads include B, if a foreign-id mutate succeeds, if create honors body `household_id`, or if `listMatches` ignores a write. Cookbook §6.2 and §6.4 tell the next agent to use the shared fake, expect 404 not 403, and not reach for Playwright.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Fake store | One small shared fake (`src/test/supabase-fake.ts`) | Filter-ignoring spies cannot fail IDOR; one helper avoids cloned builders. | Plan |
| IDOR layer | Service store + one unmocked pantry PATCH API | Filter lives in the service; one API case proves `params.id` wiring. | Research / Plan |
| #2 vs #4 split | By control (reads vs mutate+create) | Shared write path — do not list every case under both numbers. | Plan |
| Current household | `resolveHouseholdId` unit tests first | API tests inject locals and never see cookie membership. | Research / Plan |
| Re-rank | `listMatches` after real pantry write **and** recipe write | Ranking is compute-on-read; pantry-only would miss recipe US-04. | Plan |
| Match isolation | `listMatches(A)` with B seeded in the same store | Matches are read-only; #5 is same-household delta, not B’s titles. | Plan |
| Foreign-id status | 404 only (no PUT, no 403) | Live handlers map NotFound errors to 404. | Research |
| E2E / RLS / AI-native | Out of this phase (AI-native checked: 2026-09-08) | Cheapest signal is the fake + `listMatches`; Vitest cannot run RLS. | Research / test-plan |

## Scope

**In scope:** Resolver suite; shared fake; A-cannot-read-B lists/get/matches; pantry/recipe foreign-id mutate; unmocked pantry PATCH; POST extra `household_id`; write-then-`listMatches`; cookbook §6.2 and §6.4.

**Out of scope:** Playwright; live RLS; middleware import/catch-path; 401-as-IDOR; 403/PUT; mocked `listMatches` as US-02; recipe POST clone; freshness; test-plan §1–§5.

## Architecture / Approach

Belt-and-suspenders in production (locals + `.eq` + RLS). This suite locks the first two inches Vitest can see: pure `resolveHouseholdId`, then a per-query in-memory store that honors `eq` / `single` PGRST116 / delete count / `save_recipe` id+household miss. New files (`matching-store.test.ts`, `pantry-idor-api.test.ts`) avoid hoisted `vi.mock` in existing suites.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Current-household resolver | Cookie B rejected unless membership includes B | Treating join as a leak, or skipping the resolver |
| 2. Fake + read isolation | A cannot list/get/match B’s rows/titles | Spy-only `.eq`; testing the fake instead of A-vs-B |
| 3. IDOR mutate + create strip | 404 + row remains; POST ignores body household | Mocked service; 401 as IDOR; expecting 403 |
| 4. List-after-write re-rank | Pantry and recipe write then `listMatches` delta | Kitchen e2e; mocked list HTTP 200 |
| 5. Cookbook §6.2 / §6.4 | Fill TBD placeholders | Rewriting frozen §1–§5 |

**Prerequisites:** Research complete; test-plan Phase 2 change opened.
**Estimated effort:** ~2 sessions across 5 phases (the fake is the heavy lift).

## Open Risks & Assumptions

- Middleware catch-path still trusts the cookie if `listMemberships` throws; production RLS is the backstop — not in this suite.
- The fake approximates PostgREST (no embed SQL parser, no membership RPC). A true A→B leak still needs **both** app filter and RLS to fail.
- Island `pageshow` / GET cache remain residual; not Phase 2.
- Test-plan §2 still says PUT/403 and cites `src/pages/api` as the #2 hot-spot — backport via `/10x-test-plan --refresh`, not this change.

## Success Criteria (Summary)

- `npm test` locks resolver, A-cannot-see-B, foreign-id 404 with row remaining, create strip, and write-then-`listMatches`.
- Cookbook §6.2 / §6.4 are usable recipes (fake, 404, no Playwright for US-02).
