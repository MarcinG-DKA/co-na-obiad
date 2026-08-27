# Repository Guidelines

Co na obiad? is a household recipe app (inventory-first matching, Supabase auth, Cloudflare SSR) built on the 10x Astro starter. Read `@context/foundation/prd.md` for product scope before adding features.

## Hard Rules

- Never expose `SUPABASE_URL` / `SUPABASE_KEY` to the client — server-only via `astro:env` (see `@astro.config.mjs`, `@src/lib/supabase.ts`).
- New Supabase tables: migration in `supabase/migrations/` as `YYYYMMDDHHmmss_short_description.sql`, RLS enabled with per-role policies.
- API routes under `src/pages/api/` must export `const prerender = false` (full SSR — `@astro.config.mjs`).
- Merge Tailwind classes with `cn()` from `@src/lib/utils`; do not concatenate class strings.
- React islands only when interactivity is needed; no Next.js directives (`"use client"`, etc.).
- Do not delete or overwrite `@context/` foundation docs (`prd.md`, `shape-notes.md`, `tech-stack.md`) unless the user asks.
- Deeper stack conventions: `@CLAUDE.md`.

## Project Structure

- `src/pages/` — Astro routes; `src/pages/api/` — HTTP handlers (`GET`/`POST` exports, Zod-validated input).
- `src/components/` — UI; interactive pieces in React, static in Astro; shadcn/ui in `src/components/ui/` (`npx shadcn@latest add [name]`).
- `src/lib/` — Supabase client, helpers, services; shared types in `src/types.ts`.
- `src/middleware.ts` — auth gate for routes in `PROTECTED_ROUTES`.
- `context/foundation/` — PRD and planning artifacts (product source of truth).
- Path alias `@/*` → `./src/*` (`@tsconfig.json`).

## Build, Test, and Development Commands

- `npm run dev` — local dev (Cloudflare workerd runtime).
- `npm run build` — production SSR build (requires Supabase env vars).
- `npm run lint` / `npm run lint:fix` — ESLint (`@eslint.config.js`).
- `npm run format` — Prettier; `npm run preview` — production preview.
- Node **v22.14.0** (`.nvmrc`); copy `@.env.example` → `.env` or `.dev.vars`.

Pre-commit: husky + lint-staged (`@package.json`).

## Coding Style

TypeScript throughout. ESLint + Prettier enforce style — run `npm run lint` before pushing. API handlers validate with Zod. Extract React hooks to `src/components/hooks/`. Follow existing auth patterns in `@src/pages/api/auth/signin.ts` and `@src/components/auth/SignInForm.tsx`.

## Testing

No test runner configured yet. Wire a `package.json` script before documenting tests here.

## Commit and Pull Request Guidelines

Conventional Commits prefixes (`chore:`, etc.). PRs target `master`; CI runs lint + build (`.github/workflows/ci.yml`). Repo secrets: `SUPABASE_URL`, `SUPABASE_KEY`.

## Security and Configuration

Local Supabase: `npx supabase start` (Docker). Deploy: `npx wrangler deploy`. Do not commit `.env`, `.dev.vars`, or credentials. Review `npm audit` findings from bootstrap before production deploy (`@context/changes/bootstrap-verification/verification.md`).
