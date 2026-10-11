---
name: feature-map
description: Map a RoadTrip feature request through the implemented app flow, interfaces, lifecycle invariants, and relevant tests before planning or implementation.
---

# Map a RoadTrip feature

Use this workflow when asked to map a feature, inspect its architecture, or identify implementation boundaries before making a substantial change. The `architecture` specialist is the read-only feature mapper; this skill defines the expected investigation and report.

1. Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONVENTIONS.md`, and relevant sections of `docs/TESTING.md`. Check `git status` and preserve existing edits.
2. Trace the actual user flow from route and page through components, hooks, Zustand, services, shared types, IndexedDB/local storage, external REST/realtime contracts, Capacitor/native code, and tests as applicable. Inspect only relevant paths, but follow cross-layer behavior to its persistence and cleanup boundaries.
3. Report verified current behavior with paths and symbols. Identify the proposed change's owning layer, interfaces and data flow, affected files, lifecycle and compatibility invariants, external dependencies, edge cases, and relevant tests/checks.
4. Mark assumptions and unknown backend/device behavior explicitly. Resolve facts from source and docs before asking questions. Do not invent external API guarantees.
5. Keep mapping read-only. Do not edit product code, tests, plans, or durable knowledge. Hand the main agent a concise implementation contract and risks.

For a request that also asks to save a plan, continue with `$feature-plan` after the map is complete.
