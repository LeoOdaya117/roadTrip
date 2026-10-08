# RoadTrip Codex specialists and workflows

Custom subagents live in `agents/`. The `architecture` agent is the read-only
feature mapper. `qa` maps acceptance and test scenarios; `frontend_engineer` owns
only explicitly assigned Ionic React work. Code, security, and release reviewers
are read-only roles for changes that warrant independent review.

Reusable skills live in `.agents/skills/`:

- `$project-init` verifies or refreshes durable project knowledge.
- `$feature-map` traces an existing RoadTrip flow and produces an implementation
  contract without editing files.
- `$feature-plan` saves a new, dated feature plan.
- `$feature-build` implements a selected plan and records observed verification.

The main agent owns scope and integration. Use `architecture` and `qa` first for
substantial cross-layer changes; keep localized work single-agent. This app's
REST and realtime backend is external, so no repository subagent can implement it.
