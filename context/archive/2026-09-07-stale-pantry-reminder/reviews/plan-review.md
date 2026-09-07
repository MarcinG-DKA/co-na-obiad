<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Stale Pantry Reminder Implementation Plan

- **Plan**: `context/changes/stale-pantry-reminder/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-07
- **Verdict**: SOUND
- **Findings**: 0 critical 1 warning 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding

Grounding: 8/8 existing paths ✓, 5/5 symbols ✓, brief↔plan ✓ (new files `pantry-freshness.ts`, `freshness.ts`, `PantryFreshness.tsx` correctly absent). Static `freshness.ts` vs `[id].ts` confirmed (Astro static-over-dynamic; repo already has `recipes/new` vs `recipes/[id]`).

## Findings

### F1 — Missing-Supabase path can look like an empty pantry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Seed the island from `/`
- **Detail**: `index.astro` only sets `matchesLoadError` when `!supabase && householdId` and still mounts the household branch. Phase 2 loaded freshness only inside `supabase && householdId`. Defaults would stay `lastUpdatedAt: null` and `loadError: false`, so the island would show “Pantry is empty.” instead of “Could not load pantry status.” Same class of bug as `lessons.md` (errors looking like empty lists).
- **Fix**: In the Phase 2 `index.astro` contract, pass `loadError` whenever freshness did not succeed: rejected promise **or** `!supabase && householdId`. Only treat `lastUpdatedAt === null` as empty when `loadError` is false.
- **Decision**: FIXED — applied to Critical Implementation Details, Phase 2 island + index contracts, and plan-brief risks.

### F2 — Future `updated_at` can print “Updated -1 days ago”

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Pure freshness helper
- **Detail**: Relative copy is `floor((now - lastUpdatedAt) / 24h)`. If a row is slightly in the future (clock skew), that floor is negative. Helper tests did not cover age < 0.
- **Fix**: Clamp elapsed ms to ≥ 0 before bucketing; add one Jest case with `lastUpdatedAt` a few minutes after `now`.
- **Decision**: FIXED — applied to elapsed-time critical detail, Phase 1 helper contract, Testing Strategy, Progress 1.1, and plan-brief.
