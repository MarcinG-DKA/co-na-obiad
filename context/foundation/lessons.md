# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always add Jest tests with service and API work

- **Context**: Any change that adds or changes `src/lib/services/`, `src/pages/api/`, Zod schemas, or JSON response helpers. Pantry-management (S-01) shipped with lint/build and manual checks only.
- **Problem**: Behaviour that later needed impl-review fixes (quantity 0 vs `.positive()`, 0-row DELETE treated as success, DB errors looking like empty lists) was not guarded by CI. Manual Progress checkboxes cannot catch regressions after the next slice lands.
- **Rule**: Always add or extend a colocated Jest suite (`*.test.ts`) for new service and API behaviour in the same change. Run `npm test` locally; keep it in `.github/workflows/ci.yml` after lint. Mock `@/lib/supabase` in API tests so `astro:env` never loads. Do not treat lint+build as a substitute for automated tests.
- **Applies to**: plan, implement, impl-review
