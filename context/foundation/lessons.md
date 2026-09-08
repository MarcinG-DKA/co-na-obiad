# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Always add Jest tests with service and API work

- **Context**: Any change that adds or changes `src/lib/services/`, `src/pages/api/`, Zod schemas, or JSON response helpers. Pantry-management (S-01) shipped with lint/build and manual checks only.
- **Problem**: Behaviour that later needed impl-review fixes (quantity 0 vs `.positive()`, 0-row DELETE treated as success, DB errors looking like empty lists) was not guarded by CI. Manual Progress checkboxes cannot catch regressions after the next slice lands.
- **Rule**: Always add or extend a colocated Jest suite (`*.test.ts`) for new service and API behaviour in the same change. Run `npm test` locally; keep it in `.github/workflows/ci.yml` after lint. Mock `@/lib/supabase` in API tests so `astro:env` never loads. Do not treat lint+build as a substitute for automated tests.
- **Applies to**: plan, implement, impl-review

## Unit tests run on Vitest (node), not Jest

- **Context**: Runner swapped 2026-09-08. Colocated `*.test.ts` files and the mock-`@/lib/supabase` convention are unchanged.
- **Problem**: Docs and agent rules still said Jest/`ts-jest` after the stack moved to Vite-native tests, so new suites would target the wrong APIs (`jest.mock`, `jest.config.cjs`).
- **Rule**: Use Vitest (`npm test` → `vitest run`, watch via `npm run test:watch`). Config is `vitest.config.ts` with `environment: "node"` and `@/` via Vite `resolve.alias` — do not load Astro `getViteConfig` for these unit tests. Mock with `vi.mock`; partial mocks use `importOriginal`. Do not import `src/middleware.ts` (no `astro:middleware` mapper). Cloudflare Workers Vitest pool is a separate later layer.
- **Applies to**: plan, implement, impl-review
