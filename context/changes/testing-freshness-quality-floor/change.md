---
change_id: testing-freshness-quality-floor
title: Prove freshness nudge gaps and lock the CI quality floor
status: implementing
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Freshness + quality floor".
Risks covered: #6 + cross-cutting. Test types planned: unit (gap-fill) + gates.
Risk response intent: #6 prove empty pantry shows no 7-day nudge, oldest item ≥ 168h shows the nudge, under 168h does not, and load error is not treated as empty; cross-cutting prove lint + test + build stay the merge bar (no new CI YAML in this guide) and fill cookbook §6 for the patterns this phase ships.
After creating the folder, follow the downstream continuation rule.
