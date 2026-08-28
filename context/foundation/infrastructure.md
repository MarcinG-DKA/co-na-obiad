---
project: Co na obiad?
researched_at: 2026-08-28
recommended_platform: Cloudflare Workers + Pages
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 + React 19
  runtime: Cloudflare workerd (V8)
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

Cloudflare is the only platform that scores Pass on all five agent-friendly criteria: full CLI lifecycle via wrangler, fully managed serverless runtime, comprehensive llms.txt docs, deterministic `wrangler deploy` with gradual rollouts, and a GA MCP server covering 2,500+ API endpoints. The project is already bootstrapped with `@astrojs/cloudflare` v13+ and `wrangler.jsonc` — deploying requires zero adapter changes. The free tier (100k requests/day) covers the PRD's small-scale target at $0, and the developer has existing Cloudflare experience, eliminating onboarding friction.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent docs | Stable deploy API | MCP/Integration | Total |
|---|---|---|---|---|---|---|
| **Cloudflare** | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| **Vercel** | Pass | Pass | Pass | Pass | Partial | 4P 1Partial |
| **Netlify** | Partial | Pass | Pass | Pass | Pass | 4P 1Partial |
| Fly.io | Partial | Partial | Pass | Pass | Partial | 3P 2Partial |
| Railway | Partial | Partial | Pass | Pass | Pass | 3P 2Partial |
| Render | Partial | Partial | Pass | Pass | Pass | 3P 2Partial |

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

Perfect criteria score. The `@astrojs/cloudflare` v13 adapter with the Cloudflare Vite plugin means `npm run dev` runs in workerd locally — full runtime parity between dev and production. `wrangler deploy` is a single deterministic command. The free tier includes 100k requests/day, unlimited static asset bandwidth, and observability via `wrangler tail`. The MCP server is GA and covers deploy, secrets, and log access programmatically. No adapter swap required — the project ships as-is.

#### 2. Vercel

Strong Astro support via `@astrojs/vercel` v11 (GA). The CLI is the most feature-rich of all candidates — `vercel rollback`, `vercel bisect` for regression hunting, and structured `vercel logs`. The gap: Hobby tier is non-commercial (production requires Pro at $20/mo), the MCP server is public beta and read-only, and deploying would require swapping from `@astrojs/cloudflare` to `@astrojs/vercel` — touching adapter config, env access patterns, and middleware.

#### 3. Netlify

GA Astro adapter (`@astrojs/netlify` v8), credit-based free tier (300 credits/month, comfortably covers 10k-100k requests), and a GA MCP server. The gap: no CLI rollback (dashboard only, scored Partial on CLI-first), 60-second function timeout on SSR routes, 6 MB payload limit, and the same adapter-swap cost as Vercel.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. **workerd is not Node.js.** Dependencies using Node-native modules (`sharp`, `node:fs`, `node:child_process`) fail at runtime in SSR routes. npm install succeeds, but the import throws at request time — a silent failure mode. Adding recipe photo processing in v2 would require external services or prerendered-only routes.
2. **Supabase connection model.** Workers cannot hold persistent TCP connections to Postgres. Every request uses Supabase's HTTP/PostgREST API. This is fine for CRUD, but complex queries or transactions are limited to what PostgREST exposes — no raw `pg` driver.
3. **No local parity without workerd.** If workerd fails to spawn in a sandboxed CI environment (a known Astro issue), the build breaks. `.dev.vars` handling differs from production secrets — subtle env-var bugs can ship unnoticed.
4. **Free-tier cold starts.** Workers on the free plan have higher cold-start latency. For a household app with bursty access (dinner time), most requests may hit cold starts.
5. **Vendor lock-in via adapter.** `@astrojs/cloudflare` uses `cloudflare:workers` imports for env/bindings. Migrating later means rewriting every `env` access point, not just swapping the adapter.

### Pre-Mortem — How This Could Fail

The team deployed Co na obiad? on Cloudflare Workers with the free tier. The first two weeks went smoothly — auth worked, pantry CRUD was fast, recipe matching ran as server logic. Then they added recipe photo uploads. `sharp` failed silently in workerd; they switched to Cloudflare Images ($5/mo + per-image cost) as a workaround, but the API differed from what the Astro image component expected. A month later, a user reported slow recipe matching for households with 50+ recipes. The matching logic did multiple sequential Supabase queries — each over HTTP with TLS handshake overhead, no connection pooling. They tried moving matching into a Supabase Edge Function, but now business logic lived in two places. By month four, the team wanted OpenRouter-powered substitution suggestions. The AI call took 8-12 seconds; streaming responses through a Worker to the client required careful chunking the Astro adapter didn't handle natively. Six months in, the "free" platform had accumulated $15/mo in add-on services, required architectural workarounds for every non-trivial feature, and the developer spent more time fighting workerd compatibility than building product.

### Unknown Unknowns

- **`astro dev` already runs in workerd.** With `@astrojs/cloudflare` v13+ and the Cloudflare Vite plugin, `npm run dev` provides full workerd fidelity. Running `wrangler dev` separately is legacy and may cause port conflicts. Platform "Getting Started" guides may not reflect this.
- **Workers logs are ephemeral.** `wrangler tail` streams live, but there is no persistent log storage on the free tier. Debugging issues that happen outside active tailing requires Logpush (paid) or an external logging service.
- **Gradual rollouts require the paid plan ($5/mo).** The free plan only supports instant 100% traffic shifts — no canary safety net on bad deploys.
- **CORS and cookies on `*.workers.dev`.** Supabase auth cookies set on the default subdomain may collide with other Workers projects in the same browser profile. A custom domain ($0 on Cloudflare) solves this but adds DNS setup to the critical path.
- **OpenRouter streaming from Workers.** External `fetch()` calls are subject to the subrequest limit (1,000 on free, 500,000 on paid). If the client disconnects mid-stream, the Worker may keep the subrequest alive until timeout, consuming CPU budget silently.

## Operational Story

- **Preview deploys**: Push to a non-production branch; `wrangler versions upload` creates a preview version accessible via a unique URL. For GitHub-integrated projects, Cloudflare can auto-deploy PR branches. Preview URLs are public by default — add Cloudflare Access (free for up to 50 users) to protect them.
- **Secrets**: Set via `wrangler secret put <NAME>` (encrypted at rest, scoped per environment). Readable only via the dashboard or API — agents cannot read secret values, only write/overwrite. Rotation: `wrangler secret put <NAME>` again with the new value; takes effect on next deploy.
- **Rollback**: `wrangler rollback [VERSION_ID]` reverts to a previous version in seconds. `wrangler versions list` shows available targets. On the free plan, rollback is instant but ships to 100% of traffic immediately (no gradual option).
- **Approval**: Deploys and secret writes require wrangler authentication (OAuth or API token). No human-gate by default — an agent with a valid token can deploy unattended. Domain changes, billing tier upgrades, and account-level settings require dashboard access.
- **Logs**: `wrangler tail` streams live request logs (free tier, ephemeral). `wrangler tail --format json` for structured output. Persistent logging requires Logpush to an external destination (R2, S3, Datadog, etc.) — available on the paid plan.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Node-native module fails at runtime in SSR | Devil's advocate | M | H | Audit dependencies before adding; use prerendered routes for Node-only code paths; keep `nodejs_compat` flag enabled |
| Supabase HTTP overhead on complex queries | Devil's advocate | L | M | Batch queries where possible; move heavy matching logic to a Supabase Edge Function if latency exceeds 500ms |
| workerd fails to spawn in CI sandbox | Unknown unknowns | M | H | Pin wrangler version in CI; use `--compatibility-date` flag; fall back to Node-based build if needed |
| Free-tier cold starts degrade dinner-time UX | Devil's advocate | M | L | Monitor p99 latency; upgrade to $5/mo Workers Paid if cold starts exceed 200ms consistently |
| Vendor lock-in via `cloudflare:workers` imports | Devil's advocate | L | M | Isolate platform-specific env access in `src/lib/supabase.ts` (already done); document migration steps |
| Ephemeral logs — no post-hoc debugging | Unknown unknowns | M | M | Set up Logpush to R2 ($0 storage, pay egress) once paid plan is adopted |
| OpenRouter subrequest budget on free tier | Unknown unknowns | L | M | Monitor subrequest count; upgrade to paid before enabling AI features in v2 |
| Default `*.workers.dev` cookie collisions | Unknown unknowns | L | L | Configure custom domain before production launch |
| D1 read replication in public beta | Research finding | L | L | Not using D1 (external Supabase); no action needed unless migrating to D1 later |

## Getting Started

1. **Authenticate with Cloudflare.** Run `npx wrangler login` — this opens a browser OAuth flow and stores the token locally.

2. **Set the project name.** In `wrangler.jsonc`, change `"name"` from `"10x-astro-starter"` to `"co-na-obiad"`. This determines the `*.workers.dev` subdomain.

3. **Configure production secrets.** Run `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` — paste the values when prompted. These are encrypted at rest and available only in the Workers runtime (not in the build step — the build uses `astro:env/server` with `optional: true`).

4. **Build and deploy.** Run `npm run build && npx wrangler deploy`. Wrangler reads `wrangler.jsonc`, uploads the Worker + static assets from `dist/`, and returns a live URL.

5. **Set up CI auto-deploy (optional).** Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub repository secrets. The existing `.github/workflows/ci.yml` runs lint + build; extend it with `npx wrangler deploy` after a successful build on the `master` branch.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
