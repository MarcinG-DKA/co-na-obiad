---
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
---

## Why this stack

Co na obiad? is a solo, after-hours web-app MVP with a 3-week timeline, household auth, and Postgres-backed recipe/pantry CRUD — but no AI, payments, or realtime in v1. The recommended JavaScript default, 10x Astro Starter (Astro + React + TypeScript + Supabase + Cloudflare), ships auth, database, and edge deploy in one opinionated stack that matches FR-001 and household data isolation. Ingredient-overlap matching runs as straightforward server logic without LLM integration, aligned with PRD non-goals. Cloudflare Pages is the starter default; GitHub Actions with auto-deploy on merge keeps the solo shipping path short. Bootstrapper confidence is first-class — registered and expected to scaffold cleanly, though not yet verified end-to-end in every environment.
