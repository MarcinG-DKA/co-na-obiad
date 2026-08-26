---
bootstrapped_at: 2026-08-26T11:17:20Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: co-na-obiad
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: co-na-obiad
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Co na obiad? is a solo, after-hours web-app MVP with a 3-week timeline, household auth, and Postgres-backed recipe/pantry CRUD — but no AI, payments, or realtime in v1. The recommended JavaScript default, 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare), ships auth, database, and edge deploy in one opinionated stack that matches FR-001 and household data isolation. Ingredient-overlap matching runs as straightforward server logic without LLM integration, aligned with PRD non-goals. Cloudflare Pages is the starter default; GitHub Actions with auto-deploy on merge keeps the solo shipping path short. Bootstrapper confidence is first-class — registered and expected to scaffold cleanly, though not yet verified end-to-end in every environment.

## Pre-scaffold verification

| Signal             | Value                                              | Severity | Notes                                      |
| ------------------ | -------------------------------------------------- | -------- | ------------------------------------------ |
| npm package        | not run                                            | —        | cmd_template uses git clone; npm step skipped |
| GitHub repo        | przeprogramowani/10x-astro-starter pushed 2026-08-22 | fresh    | via GitHub API (gh unavailable; curl used) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`

**Strategy**: git-clone

**Exit code**: 0

**Files moved**: 31423

**Conflicts (.scaffold siblings)**: none

**.gitignore handling**: moved silently

**.bootstrap-scaffold cleanup**: deleted

Upstream `.git/` removed before move-up. Existing `context/` preserved.

## Post-scaffold audit

**Tool**: npm audit --json

**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW

**Direct vs transitive**: not distinguished by this tool

#### CRITICAL findings

- tar (<=7.5.20) — node-tar PAX size override causes tar parser interpretation differential (file smuggling)

#### HIGH findings

- astro (<=7.0.9) — XSS via unescaped attribute names in spread props
- brace-expansion — DoS via exponential-time expansion
- devalue — DoS via sparse array deserialization
- fast-uri — host confusion via backslash authority delimiter
- js-yaml — quadratic-complexity DoS in merge key handling
- (8 additional HIGH findings — run `npm audit` for full list)

#### MODERATE findings

7 moderate findings — run `npm audit` for full list.

#### LOW / INFO findings

2 low findings — run `npm audit` for full list.

## Hints recorded but not acted on

| Hint                       | Value                |
| -------------------------- | -------------------- |
| bootstrapper_confidence    | first-class          |
| quality_override           | false                |
| path_taken                 | standard             |
| self_check_answers         | null                 |
| team_size                  | solo                 |
| deployment_target          | cloudflare-pages     |
| ci_provider                | github-actions       |
| ci_default_flow            | auto-deploy-on-merge |
| has_auth                   | true                 |
| has_payments               | false                |
| has_realtime               | false                |
| has_ai                     | false                |
| has_background_jobs        | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
