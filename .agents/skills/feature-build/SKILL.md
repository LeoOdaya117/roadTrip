---
name: feature-build
description: Implement a selected RoadTrip feature plan, coordinate bounded specialists, verify integrated behavior, and record observed progress.
---

# Build from a saved plan

Use when asked to implement or continue a saved plan.

1. Read `AGENTS.md`, `.codex/knowledge/` when present, the selected plan, and relevant architecture/convention/testing guides. If the plan is ambiguous, ask which one. Check current changes and preserve unrelated work.
2. Confirm the plan still matches source. Resolve product-intent or material interface drift with the user; document narrow technical adjustments in the plan.
3. Keep the main agent responsible for scope, external contracts, integration, and final reporting. For substantial cross-layer work, have `architecture` map dependencies and `qa` design scenarios as read-only tasks first. Then delegate only independent, non-overlapping implementation or review scopes. RoadTrip has no backend implementation in this repository.
4. Implement the acceptance criteria and tests required by `AGENTS.md`. Preserve ride/session IDs, solo/group behavior, persistence migrations, filter behavior, coordinate-order boundaries, and resource cleanup where applicable.
5. Run required checks in `docs/TESTING.md` and checks relevant to the plan. Fix failures required by the repository policy. Record exact commands and observed results; identify unavailable physical-device checks.
6. Update the selected plan's status and progress without replacing its goal or acceptance criteria. Update durable knowledge only for verified architecture/convention changes and decisions.
7. Report changed areas, verification actually completed, failures or skipped checks, and remaining concrete limitations.
