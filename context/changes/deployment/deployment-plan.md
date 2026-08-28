# Cloudflare Integration and Deployment Plan

Based on `context/foundation/infrastructure.md`, the project is already bootstrapped with `@astrojs/cloudflare` v13 and `wrangler.jsonc`. The remaining work is: rename the worker, configure Cloudflare Workers Builds for auto-deploy, prepare custom domain routing, and harden against documented edge cases.

**Deployment strategy:** Cloudflare Workers Builds (native git integration) handles auto-deploy on push to `master`. No GitHub Actions deploy job needed — Cloudflare connects directly to the repo, builds on its infrastructure, and deploys. The existing GHA workflow remains lint+build only (CI quality gate).

---

## Phase 0: Prerequisites

**Goal:** Ensure the local development environment and external services are ready before deploying.

### 0.1 Node.js

- [x] Install Node.js v22.14.0 (matches `.nvmrc`)
  ```bash
  nvm install    # reads .nvmrc automatically
  nvm use
  ```
- [x] Verify: `node -v` should print `v22.14.0`

### 0.2 Wrangler CLI (Cloudflare)

Wrangler is already in `devDependencies` (`"wrangler": "^4.90.0"`), so it's available via `npx wrangler` after `npm install`. No global install needed.

- [x] Run `npm install` to ensure wrangler is available locally
- [x] Authenticate with Cloudflare:
  ```bash
  npx wrangler login
  ```
  This opens a browser OAuth flow. After approval, a token is stored at `~/.wrangler/config/default.toml`.
- [x] Verify authentication:
  ```bash
  npx wrangler whoami
  ```
  Should display your Cloudflare account name and ID.

**Edge case — corporate proxy or WSL:** If the browser doesn't open, use the manual flow:

```bash
npx wrangler login --browser false
```

Copy the URL to your browser, complete auth, and paste the callback URL back.

### 0.3 Supabase CLI

The Supabase CLI is already in `devDependencies` (`"supabase": "^2.115.0"`). It's used for local development (Docker-based Postgres + Auth + Studio).

- [x] Ensure Docker is installed and running (required by local Supabase)
- [x] Run `npm install` to ensure the CLI is available via `npx supabase`
- [x] Start local Supabase:
  ```bash
  npx supabase start
  ```
  On first run this pulls Docker images (~2-5 min). Subsequent starts are fast.
- [x] After startup, note the output — it displays local URLs and keys:
  - **API URL:** `http://127.0.0.1:54321`
  - **Studio URL:** `http://127.0.0.1:54323`
  - **anon key** and **service_role key**

### 0.4 Local Environment Variables

The app needs two env files for local development:

- [x] Copy `.env.example` to `.env` (used by Node/Astro tooling):
  ```bash
  cp .env.example .env
  ```
- [x] Fill in `.env` with your Supabase values (local or remote):
  ```
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_KEY=<anon-key-from-supabase-start-output>
  ```
- [x] Create/update `.dev.vars` (used by wrangler/workerd runtime during `npm run dev`):
  ```
  SUPABASE_URL=http://127.0.0.1:54321
  SUPABASE_KEY=<anon-key-from-supabase-start-output>
  ```

**Why two files?** `.env` is read by Astro/Vite at build time. `.dev.vars` is read by the Cloudflare Vite plugin to inject secrets into the local workerd runtime. Both are gitignored.

### 0.5 Supabase Remote Project (Production)

For deployment, you need a hosted Supabase project:

- [x] Create a project at [supabase.com/dashboard](https://supabase.com/dashboard) (free tier is sufficient for MVP)
- [x] Note the project's **URL** and **anon key** from Settings > API
- [x] Link the local CLI to the remote project:
  ```bash
  npx supabase link --project-ref <your-project-ref>
  ```
  The project ref is the subdomain portion of your Supabase URL (e.g., `luafgtdaxyphhcctcwrf`).
- [x] Push local migrations to remote (when migrations exist):
  ```bash
  npx supabase db push
  ```

### 0.6 Cloudflare Account

- [x] Sign up or sign in at [dash.cloudflare.com](https://dash.cloudflare.com)
- [x] Note your **Account ID** (shown in the right sidebar of any Workers & Pages page)
- [x] The free tier (100k requests/day) covers MVP scale at $0

### 0.7 Verify Local Dev Works

- [x] Run the dev server:
  ```bash
  npm run dev
  ```
  This starts Astro in the workerd runtime (full Cloudflare parity). The app should be accessible at `http://localhost:4321`.
- [x] Verify auth works: navigate to `/auth/signin` and attempt a login against local Supabase.

---

## Phase 1: Wrangler Configuration

**Goal:** Make `wrangler.jsonc` production-ready. The worker name here **must match** the Worker name in the Cloudflare dashboard for Builds to succeed.

- [x] Rename `"name"` from `"10x-astro-starter"` to `"co-na-obiad"` in `[wrangler.jsonc](wrangler.jsonc)`
- [x] Add `"account_id"` field (placeholder comment for the developer to fill in, or read from env)
- [x] Add `routes` array with `custom_domain: true` entry (commented out with instructions until domain is ready)
- [x] Verify `compatibility_flags: ["nodejs_compat"]` is present (required for `@supabase/ssr` to avoid dynamic require errors — see [supabase/supabase#37592](https://github.com/supabase/supabase/issues/37592))
- [x] Pin `compatibility_date` to a known-good value (current: `2026-05-08` is fine)

**Edge case — multi-environment deploys:** With `@astrojs/cloudflare` v13, `wrangler deploy --env` is broken ([withastro/astro#16040](https://github.com/withastro/astro/issues/16040)). Environments must be resolved at build time via `CLOUDFLARE_ENV=<name> astro build`. The plan uses a single production environment for now (MVP scope), with a comment documenting how to add staging later.

---

## Phase 2: Package & Script Updates

**Goal:** Align `package.json` with the production project name and add convenience scripts for local/manual deploys.

- [x] Change `"name"` from `"10x-astro-starter"` to `"co-na-obiad"` in `[package.json](package.json)`
- [x] Add `"deploy": "npm run build && npx wrangler deploy"` script (for manual deploys from local machine)
- [x] Add `"deploy:preview": "npx wrangler versions upload"` script for preview deploys
- [x] Add `"tail": "npx wrangler tail --format json"` script for live log streaming

---

## Phase 3: Cloudflare Workers Builds — Auto-Deploy on Push

**Goal:** Enable Cloudflare's native git integration so every push to `master` triggers a build+deploy on Cloudflare's infrastructure. No GHA deploy job needed.

### How it works

Cloudflare Workers Builds connects directly to the GitHub repo. On every push to the configured production branch (`master`), it:

1. Runs the **build command** (`npm run build`)
2. Runs the **deploy command** (`npx wrangler deploy`)
3. Uploads the version and promotes it to the active deployment

For non-production branches (PRs), it runs `npx wrangler versions upload` — creating a preview version accessible via a unique URL without promoting to production.

### Setup Steps (Dashboard — one-time manual action)

- [x] Create a Worker named `co-na-obiad` in the Cloudflare dashboard (Workers & Pages > Create)
- [x] Go to the Worker's **Settings > Builds > Connect** and link the GitHub repository
- [x] Configure build settings:
  - **Production branch:** `master`
  - **Build command:** `npm run build`
  - **Deploy command:** `npx wrangler deploy`
  - **Root directory:** `/` (default, since `package.json` is at repo root)
- [x] Set **build variables and secrets** (Settings > Build > Build Variables and Secrets):
  - `SUPABASE_URL` (secret) — needed at build time for `astro:env` validation
  - `SUPABASE_KEY` (secret) — needed at build time for `astro:env` validation
  - `NODE_VERSION` = `22` (variable) — or rely on `.nvmrc` which already contains `22.14.0`

- [~] Enable **non-production branch builds** for PR preview deploys (skipped — not needed for MVP)

- [x] Verify the first push triggers a successful build in the Builds tab

### Important Constraints

- The `"name"` field in `wrangler.jsonc` **must match** the Worker name in the dashboard, or the build will fail.
- Build secrets (`SUPABASE_URL`, `SUPABASE_KEY`) are only available during the build step — they are NOT runtime secrets. Runtime secrets must still be set separately (see Phase 4).
- Cloudflare's build image auto-detects Node version from `.nvmrc`. The project already has `.nvmrc` with `22.14.0`.
- Builds are serialized per Worker — no concurrent deploy race conditions (unlike GHA which needs explicit `concurrency` groups).

### What stays in GHA

The existing `.github/workflows/ci.yml` continues to run lint+build as a quality gate on PRs. It does **not** deploy. This gives fast PR feedback without duplicating the deploy step.

---

## Phase 4: Secrets Management

**Goal:** Configure secrets correctly for both build-time and runtime.

### Build-time secrets (Cloudflare Workers Builds dashboard)

- [x] Add `SUPABASE_URL` as a build secret (Settings > Build > Build Variables and Secrets, `is_secret: true`)
- [x] Add `SUPABASE_KEY` as a build secret (Settings > Build > Build Variables and Secrets, `is_secret: true`)

Note: The Builds API requires a separately-scoped API token ("Workers Builds: Edit") which the standard wrangler OAuth flow does not include. These must be set via the dashboard.

### Runtime secrets (Worker environment)

- [x] Set runtime secrets via wrangler CLI:
  - `npx wrangler secret put SUPABASE_URL`
  - `npx wrangler secret put SUPABASE_KEY`
- [ ] Alternatively, set via dashboard: Worker > Settings > Variables & Secrets > Add (type: Secret)

### Verification

- [x] Verify that `[astro.config.mjs](astro.config.mjs)` marks env vars as `optional: true` (already done — build succeeds even without them at build time, runtime uses wrangler secrets)
- [x] Confirm `[src/lib/supabase.ts](src/lib/supabase.ts)` handles the null case gracefully (already returns `null` when vars are missing)

**Edge case — build vs. runtime secrets:** These are distinct in Cloudflare. Build secrets are available only during the build step on Cloudflare's build VM. Runtime secrets are injected into the Worker at request time. Both must be set for the app to function correctly.

---

## Phase 5: Custom Domain Preparation

**Goal:** Prepare routing for a custom domain (avoids `*.workers.dev` cookie collisions flagged in infrastructure.md).

- [x] Add commented `routes` config in `wrangler.jsonc` with instructions:

```jsonc
// Uncomment after adding domain to Cloudflare as a zone:
// "routes": [{ "pattern": "conaobiad.example.com", "custom_domain": true }]
```

- [ ] Document the setup steps:
  1. Add domain to Cloudflare (update nameservers at registrar)
  2. Remove any conflicting DNS records for the target hostname
  3. Uncomment routes, push to master (Workers Builds will deploy with the new route)
  4. Enable "Always Use HTTPS" and "Full (strict)" SSL in dashboard

**Why this matters:** The infrastructure.md risk register flags that Supabase auth cookies on `*.workers.dev` can collide with other Workers projects in the same browser profile. A custom domain isolates the cookie scope.

---

## Phase 6: Supabase Auth Hardening for Workers Runtime

**Goal:** Address known edge cases with `@supabase/ssr` on Cloudflare Workers.

- [x] Verify `nodejs_compat` flag is present in `wrangler.jsonc` (prevents `dynamic require of "stream"` error)
- [x] Review `@supabase/ssr` version (currently `^0.10.3`) — v0.10.0+ adds a `headers` parameter to `setAll` for CDN cache-control. Check if `[src/lib/supabase.ts](src/lib/supabase.ts)` needs updating to forward cache-control headers (see [supabase/supabase#44351](https://github.com/supabase/supabase/pull/44351))
- [x] If `setAll` signature is outdated, update it to accept and forward the `headers` param to prevent CDN caching of authenticated responses
- [x] Add `SameSite=Lax; Secure; Path=/` defaults to cookie options if not already set by Supabase client

---

## Phase 7: Rollback & Observability Documentation

**Goal:** Ensure the team knows how to recover from bad deploys and debug issues.

- [x] Document rollback procedure: `npx wrangler versions list` then `npx wrangler rollback [VERSION_ID]`
- [x] Document live log access: `npx wrangler tail --format json`
- [x] Note limitation: free tier has no persistent log storage — only live streaming via `wrangler tail`
- [x] Document: in Workers Builds, to disable auto-deploy while still building, change deploy command to `npx wrangler versions upload` (creates versions without promoting)

### Operations Runbook

**Live logs (streaming only, free tier):**

```bash
npm run tail
# or with filters:
npx wrangler tail --format json --status error
npx wrangler tail --format json --search "GET /dashboard"
```

**List deployed versions:**

```bash
npx wrangler versions list
```

**Rollback to a previous version:**

```bash
npx wrangler versions list          # find the VERSION_ID to revert to
npx wrangler rollback <VERSION_ID>  # instant, 100% traffic shift (no canary on free tier)
```

**Pause auto-deploy (builds still run, but don't promote):**
Change the deploy command in Cloudflare dashboard (Settings > Build) from:

- `npx wrangler deploy` to `npx wrangler versions upload`

This creates versions without promoting them. To resume auto-deploy, change it back.

**Manual deploy from local machine:**

```bash
npm run deploy           # builds + deploys to production
npm run deploy:preview   # uploads version without promoting (for testing)
```

**Free tier limitations:**

- `wrangler tail` streams live only — no persistent log storage
- Logs are lost once the tail session ends
- For post-hoc debugging, upgrade to paid plan and set up Logpush to R2

---

## Edge Cases and Risk Mitigations Summary


| Edge Case                                         | Source                                                                   | Mitigation in Plan                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `--env` flag silently ignored in v13              | [withastro/astro#16040](https://github.com/withastro/astro/issues/16040) | Use `CLOUDFLARE_ENV` at build time; document in wrangler.jsonc |
| `dynamic require of "stream"` in SSR              | [supabase#37592](https://github.com/supabase/supabase/issues/37592)      | Verify `nodejs_compat` flag                                    |
| CDN caches authenticated responses                | [supabase#44351](https://github.com/supabase/supabase/pull/44351)        | Update `setAll` to forward cache-control headers               |
| Cookie collision on `*.workers.dev`               | infrastructure.md risk register                                          | Custom domain preparation (Phase 5)                            |
| Worker name mismatch between config and dashboard | Cloudflare Builds docs                                                   | Explicit rename in Phase 1; document the constraint            |
| Build secrets vs runtime secrets confusion        | Cloudflare docs                                                          | Separate steps in Phase 4 for each; document the distinction   |
| `.nvmrc` not detected by build image              | Cloudflare build image docs                                              | Explicit `NODE_VERSION=22` as fallback build variable          |
| Overlapping deploys race condition                | N/A                                                                      | Workers Builds serializes deploys per Worker natively          |


---

## Cloudflare Dashboard Secrets Checklist

Before the first deploy, configure in the Cloudflare dashboard:

**Build Variables & Secrets** (Settings > Build):

- `SUPABASE_URL` (secret) — for build-time `astro:env`
- `SUPABASE_KEY` (secret) — for build-time `astro:env`
- `NODE_VERSION` = `22` (variable, optional if `.nvmrc` is present)

**Runtime Secrets** (Settings > Variables & Secrets, or via `wrangler secret put`):

- `SUPABASE_URL` — for request-time Supabase client
- `SUPABASE_KEY` — for request-time Supabase client

**GitHub Repository Secrets** (for the lint+build CI job only):

- `SUPABASE_URL` — already present
- `SUPABASE_KEY` — already present

No `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` needed in GitHub — Cloudflare Builds handles auth via its own GitHub App installation.

---

## Out of Scope

- Multi-environment (staging) deploy pipeline — MVP uses single production environment
- Logpush to R2 — requires paid plan
- Custom domain purchase/DNS transfer — developer action
- GHA-based deployment (replaced by Cloudflare Workers Builds)

