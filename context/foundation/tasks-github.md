# GitHub tasks: Co na obiad?

Snapshot of the M-1 roadmap as GitHub Issues on [MarcinG-DKA/co-na-obiad](https://github.com/MarcinG-DKA/co-na-obiad).

`roadmap.md` remains the source of truth for sequencing. This file is the issue index after the 2026-09-01 migration.

| | |
| --- | --- |
| **Repo** | https://github.com/MarcinG-DKA/co-na-obiad |
| **Milestone** | [M-1: Inventory-first MVP](https://github.com/MarcinG-DKA/co-na-obiad/milestone/1) |
| **Migrated** | 2026-09-01 |
| **Source** | [`roadmap.md`](roadmap.md) |

## Labels

| Label | Use |
| ----- | --- |
| `type:foundation` | F-NN work items |
| `type:slice` | S-NN work items |
| `status:ready` | Prerequisites met; ready for `/10x-plan` |
| `status:proposed` | Sequenced but not yet unblocked |
| `north-star` | S-03 (core hypothesis) |
| `parked` | Deferred; not in M-1 |
| `enhancement` | Applied to all work issues |

## Work issues (milestone M-1)

| Roadmap ID | Issue | Change ID | Status | Blocked by |
| ---------- | ----- | --------- | ------ | ---------- |
| F-01 | [#1 Household data model + RLS policies](https://github.com/MarcinG-DKA/co-na-obiad/issues/1) | `household-data-scaffold` | ready | — |
| S-01 | [#2 Pantry view and edit](https://github.com/MarcinG-DKA/co-na-obiad/issues/2) | `pantry-management` | proposed | #1 |
| S-02 | [#3 Recipe CRUD with ingredient lists](https://github.com/MarcinG-DKA/co-na-obiad/issues/3) | `recipe-management` | proposed | #1 |
| S-03 | [#4 Recipe matching ranked by pantry overlap](https://github.com/MarcinG-DKA/co-na-obiad/issues/4) | `pantry-recipe-matching` | proposed (north star) | #2, #3 |
| S-04 | — | `change-homepage` | proposed | F-01 |
| S-05 | [#5 Stale pantry reminder (7-day nudge)](https://github.com/MarcinG-DKA/co-na-obiad/issues/5) | `stale-pantry-reminder` | proposed | #2, S-04 |

S-01 and S-02 can run in parallel after F-01. S-03 is the north star — the smallest end-to-end slice that proves inventory-first matching. S-04 (dashboard at `/`) comes next; S-05 follows S-04.

## Parked issues (no milestone)

| Issue | Why parked |
| ----- | ---------- |
| [#6 Favorite recipes (FR-006)](https://github.com/MarcinG-DKA/co-na-obiad/issues/6) | Nice-to-have in PRD; deferred for speed. |
| [#7 Ingredient substitution suggestions](https://github.com/MarcinG-DKA/co-na-obiad/issues/7) | PRD Non-Goals; v2. |
| [#8 Shopping list generation](https://github.com/MarcinG-DKA/co-na-obiad/issues/8) | PRD Non-Goals; v2. |
| [#9 AI/LLM-powered features](https://github.com/MarcinG-DKA/co-na-obiad/issues/9) | PRD Non-Goals; overlap matching only in v1. |
| [#10 Public/shared recipe catalog](https://github.com/MarcinG-DKA/co-na-obiad/issues/10) | PRD Non-Goals; household library only. |
| [#11 Multi-day meal planning / calendar](https://github.com/MarcinG-DKA/co-na-obiad/issues/11) | PRD Non-Goals; MVP is "what to cook tonight." |

## Next move

Run `/10x-plan household-data-scaffold` on **F-01** (#1). It is the only `ready` item and unblocks S-01 and S-02.
