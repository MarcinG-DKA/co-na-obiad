---
project: Co na obiad?
version: 1
status: draft
created: 2026-08-26
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-09-12
  after_hours_only: true
---

## Vision & Problem Statement

Home cooks forget what they can make with the ingredients they already have and don't know how to substitute missing ingredients. The pain peaks when they stand in front of the fridge or pantry facing decision paralysis — too many possible meals, no clear path from "what's here" to "what to cook tonight." The cost today is food waste: ingredients expire unused because the cook never connects inventory to a concrete meal plan.

Most recipe apps are browse-first — users scroll catalogs hoping something matches their pantry. The insight is to invert that: inventory-first. Start from what's on hand, surface only what the cook can actually make, and handle missing ingredients with substitution rather than abandoning the recipe.

## User & Persona

**Primary persona:** Home cook preparing regular weeknight meals for themselves or their family.

They reach for this product when standing in front of the fridge or pantry, unsure what to make with what's available. They have a personal recipe collection (saved links, notes, family recipes) but it doesn't help them decide *tonight's* meal against *tonight's* ingredients. They need a fast answer: "Given what I have, what can I cook — and if I'm missing one thing, what can I swap?"

## Success Criteria

### Primary

End-to-end inventory-first flow works:

1. User opens app and logs in (OAuth with email/password fallback).
2. User sees household pantry/fridge contents.
3. User sees recipe propositions ranked by ingredient overlap (basic matching).
4. User edits pantry contents → propositions update.
5. User browses full recipe list; creates, updates, or deletes recipes.

Deferred to v2: shopping list generation, ingredient substitution suggestions.

### Secondary

- User can save/favorite recipes for quick access.

### Guardrails

- Pantry and recipe data visible only to household members — no cross-household data leakage.

## User Stories

### US-01: User logs in

- **Given** the user is on the login page
- **When** the user picks an OAuth provider or enters a valid email and password and clicks the login button
- **Then** the user is redirected to the household page

### US-02: Pantry edit updates matching recipes

- **Given** a logged-in user on the household page with pantry items and saved recipes
- **When** the user edits fridge contents (adds or removes an ingredient)
- **Then** the matching-recipes list updates to reflect the new pantry state

### US-03: Stale pantry reminder

- **Given** a logged-in user on the household page whose pantry has not been updated in 7 days
- **When** the user views recipe matches
- **Then** the product shows a reminder that matches may be inaccurate and offers a path to review pantry contents

### US-04: Recipes edit

- **Given** a logged-in user on the household page with pantry items and saved recipes
- **When** the user edits existing recipe or add new one
- **Then** the matching-recipes list updates to reflect the new or edited recipe

## Functional Requirements

- FR-001: User can log in. Priority: must-have
  > Socrates: Counter-argument considered: "OAuth + email fallback is over-engineered for v1 — auth eats the 3-week budget." Resolution: kept; household sharing requires authenticated users, auth scope locked in Phase 2.
- FR-002: User can see fridge contents. Priority: must-have
  > Socrates: Counter-argument considered: "Users won't maintain accurate fridge data — stale inventory makes matching useless." Resolution: kept; inventory-first model depends on visible pantry state; stale-data handled via last-updated display and 7-day review nudge (FR-007, FR-008, US-03).
- FR-003: User can modify fridge contents. Priority: must-have
  > Socrates: Counter-argument considered: "Manual pantry updates are tedious — users will abandon upkeep after a week." Resolution: kept; editing is required for matching to reflect reality (US-02).
- FR-004: User can see a list of recipes matching fridge contents. Priority: must-have
  > Socrates: Counter-argument considered: basic overlap might produce bad suggestions. Resolution: kept; matching is the core differentiator — without it the product reverts to browse-first apps.
- FR-005: User can add, delete, or modify recipes. Priority: must-have
  > Socrates: Counter-argument considered: "Full CRUD is scope creep — seed recipes and allow add-only for v1." Resolution: kept; user explicitly scoped full recipe management into the 3-week MVP flow.
- FR-006: User can favorite recipes. Priority: nice-to-have
  > Socrates: Counter-argument considered: favorites could distract from proving matching. Resolution: kept as nice-to-have; low-cost retention hook for repeat cooks.
- FR-007: User can see when the household pantry was last updated. Priority: must-have
- FR-008: User is prompted to review pantry contents when the pantry has not been updated within 7 days. Priority: must-have

## Non-Functional Requirements

- Household pantry and recipe data is accessible only to authenticated members of that household — no cross-household visibility.
- Users can always see when the household pantry was last updated.
- When the pantry has not been updated within 7 days, the product surfaces a non-blocking reminder that recipe matches may be inaccurate and encourages a pantry review.

## Business Logic

The app ranks saved recipes by how well they match the household's current pantry.

**Inputs:** The household's pantry items (what's currently on hand) and saved recipes with their ingredient lists.

**Output:** An ordered list of recipes with a match score indicating how well each recipe fits the current pantry.

**User encounter:** The ranked list appears on the household page after login. When the user edits pantry contents, the list re-ranks automatically to reflect the updated inventory.

## Access Control

- **Authentication:** OAuth (Google, Apple, etc.) with email/password as fallback.
- **Access model:** Household sharing — multiple users share one pantry and recipe library.

## Non-Goals

- **No ingredient substitution suggestions in v1** — deferred to v2; MVP proves inventory-first matching first.
- **No shopping list generation in v1** — deferred to v2.
- **No AI/LLM-powered features in v1** — basic ingredient-overlap matching only; avoids scope and cost of model integration.
- **No public/shared recipe catalog** — personal/household library only; no browse-first community recipes.
- **No multi-day meal planning or calendar features** — MVP solves "what can I cook tonight?", not weekly planning.

## Open Questions

_(None.)_
