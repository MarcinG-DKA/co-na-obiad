# Repository Guidelines

Co na obiad? is a household recipe app (inventory-first matching, Supabase auth, Cloudflare SSR) built on the 10x Astro starter. Read `@context/foundation/prd.md` for product scope before adding features.

## Hard Rules

- Never expose `SUPABASE_URL` / `SUPABASE_KEY` to the client — server-only via `astro:env` (see `@astro.config.mjs`, `@src/lib/supabase.ts`).
- Do not commit `.env`, `.dev.vars`, or credentials.
- New Supabase tables: migration in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`, RLS enabled with per-role policies.
- API routes under `src/pages/api/` must export `const prerender = false` (full SSR — `@astro.config.mjs`).
- Merge Tailwind classes with `cn()` from `@src/lib/utils`; do not concatenate class strings.
- React islands only when interactivity is needed; no Next.js directives (`"use client"`, etc.).
- Do not delete or overwrite `@context/` foundation docs (`prd.md`, `shape-notes.md`, `tech-stack.md`) unless the user asks.
- Deeper stack conventions: `@CLAUDE.md`.

## Project Structure

- `src/pages/` — Astro routes and API handlers.
- `src/components/` — UI (Astro + React).
- `src/lib/` — Supabase client, helpers, services.
- `context/foundation/` — PRD and planning artifacts.

Auth flow, path alias, shadcn, and middleware details: `@CLAUDE.md`.

## Build, Test, and Development Commands

Run scripts from `@package.json` (`dev`, `build`, `lint`, `lint:fix`, `format`, `preview`, `test`). Node **v22.14.0** (`.nvmrc`). Copy `@.env.example` → `.env` or `.dev.vars`. Run `npm run lint` and `npm test` before pushing. Pre-commit: husky + lint-staged (`@package.json`).

## Coding Style

API handlers validate with Zod. Extract React hooks to `src/components/hooks/`. Follow existing auth patterns in `@src/pages/api/auth/signin.ts` and `@src/components/auth/SignInForm.tsx`. Lint/format rules: `@eslint.config.js`.

## Testing

Jest (`npm test`) with `ts-jest`. Colocate `*.test.ts` next to the module under test (`src/lib/services/pantry.test.ts`, `src/pages/api/pantry/pantry-api.test.ts`). CI runs `npm test` after lint. Mock `@/lib/supabase` in API tests so `astro:env` is never loaded.

## Commit and Pull Request Guidelines

Conventional Commits prefixes (`chore:`, etc.). PRs target `master`; CI runs lint + build (`.github/workflows/ci.yml`). Repo secrets: `SUPABASE_URL`, `SUPABASE_KEY`.

## Security and Configuration

Local Supabase: `npx supabase start` (Docker). Deploy: `npx wrangler deploy`. Review `npm audit` findings before production deploy (`@context/changes/bootstrap-verification/verification.md`).
