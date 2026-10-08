---
name: feature-plan
description: Turn a RoadTrip feature request into a repository-grounded, decision-complete implementation plan saved under .codex/plans/.
---

# Save a feature plan

Use when asked to plan a feature or preserve an implementation plan for later work.

1. Read `AGENTS.md`, available `.codex/knowledge/`, the relevant architecture/convention/testing guides, and inspect the affected source and tests. Use `$feature-map` for substantial cross-layer changes.
2. Resolve discoverable questions from the repository. Clarify only material product choices that cannot be inferred; state sensible defaults for optional choices.
3. Save a new Markdown file at `.codex/plans/YYYY-MM-DD-<short-feature-slug>.md` using the current local date. Add a numeric suffix if the path exists; never replace an earlier plan.
4. Include goal and acceptance criteria, affected boundaries and files, contracts/data changes, lifecycle and compatibility concerns, failure/edge cases, test scenarios, required checks, and assumptions. Distinguish app-owned work from external backend/device dependencies.
5. Do not modify application code while planning. Report the plan path and unresolved decisions.
