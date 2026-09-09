# Freshness + quality floor — Plan Brief

> Full plan: `context/changes/testing-freshness-quality-floor/plan.md`
> Research: `context/changes/testing-freshness-quality-floor/research.md`

## What & Why

Rollout Phase 3 of `context/foundation/test-plan.md`: prove the household 7-day nudge does not fire on an empty pantry or a load error, does fire when the **oldest** item is ≥ 168h, and does not fire under 168h (Risk #6); prove lint + test + build stay the merge bar **without a new CI YAML** and fill cookbook §6.5 / §6.6.

## Starting Point

Elapsed-ms helper tests already cover empty / 168h / under with injected `now`. The island’s `loadError` path is untested. Mixed-age MIN and delete→recompute are untested because `createSupabaseFake` has no `limit` / `maybeSingle`. CI already runs lint → test → build on `main`. Agent rules still say lint+build on `master`.

## Desired End State

`npm test` fails if MIN becomes MAX, if deleting a fresher row clears the nudge signal, if `loadError`+`null` is classified as empty, or if a successful empty load shows the nudge. Cookbook §6.5 is the freshness recipe; §6.6 + CLAUDE/AGENTS name the existing three CI scripts on `main`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Load error ≠ empty | Extract `resolvePantryFreshnessView` next to `evaluatePantryFreshness`; wire `PantryFreshness`; assert `kind` + `showNudge` | Helper-null cannot see `loadError`; jsdom/Playwright are the listed anti-pattern. | Research / Plan |
| MIN + delete vehicle | Extend shared fake with `limit` + `maybeSingle`; keep query-shape mock | Same store as `removePantryItem`; aliasing `maybeSingle` to `single()` makes empty look like an error. | Research / Plan |
| Delete cases | Mixed MIN; delete stalest; delete fresher; delete last — no edit-fresher | Opposite outcomes lock the reframed challenge; edit-fresher skipped to keep the suite small. | Plan |
| Floor lock | Cookbook §6.5/§6.6 + CLAUDE/AGENTS CI sentences; no YAML; no §4/§5 rewrite | YAML already has `npm test`; docs are what still lie. | Research / Plan |
| §2 Must-challenge | Defer reword to `/10x-test-plan` / `--refresh` | In-place §2 edit is a test-plan pass; cookbook will state the reframed delete rule. | Research / Plan |
| E2E / AI-native | Out of this phase (checked: 2026-09-09) | Injected `now` + fake store are cheaper than DOM or a vision layer. | Research / test-plan |

## Scope

**In scope:** View helper + island wiring; fake `limit`/`maybeSingle`; fake-store MIN/delete; cookbook §6.5/§6.6; CLAUDE/AGENTS merge-bar sentences.

**Out of scope:** Playwright/jsdom/`index.astro`; new CI YAML; grep-test of `ci.yml`; adding `npm test` as if missing; `astro check` in GHA; §1–§5 rewrite; §2 backport; husky vs lefthook; item-level `/pantry` UI; keep-last-good refetch.

## Architecture / Approach

Freshness is a read model: household-scoped MIN timestamp, elapsed-ms rule, small island. Phase 1 composes `loadError` in front of `evaluatePantryFreshness`. Phase 2 teaches the Phase 2 fake the two PostgREST bits the MIN query needs, then re-reads after delete. Phase 3 documents that floor; it does not add a job.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Load error is not empty | View helper + island wiring; boolean suite | Unused extract; copying `STALE_AFTER_MS`; English as oracle |
| 2. MIN + reframed delete | Fake `limit`/`maybeSingle`; mixed-age + three deletes | `maybeSingle` → PGRST116 on empty; mocked “oldest” as MIN |
| 3. Cookbook + CI sentences | §6.5/§6.6; agent rules on `main` + lint/test/build | Second YAML; rewriting frozen §1–§5 |

**Prerequisites:** Research complete; test-plan Phase 3 change opened.
**Estimated effort:** ~1–2 sessions across 3 phases (fake `maybeSingle` is the sharp edge).

## Open Risks & Assumptions

- Test-plan §2 still says “deleting a fresh row clears the nudge” until `--refresh`; this suite and §6.5 are the working rule.
- §4 still says 13 test files; §5 still implies `npm run build` typechecks — left frozen on purpose.
- GitHub required checks on job `ci` are unproven; cookbook states the intended bar only.
- Island keep-last-good refetch and SSR/client clock skew at exactly 168h remain residual.
- CLAUDE/AGENTS may still mention husky; lefthook is the real pre-commit hook.

## Success Criteria (Summary)

- `npm test` locks loadError≠empty (`kind`/`showNudge`) and household MIN + delete-recompute.
- Cookbook §6.5 / §6.6 plus agent CI sentences match the existing single workflow; no new YAML.
