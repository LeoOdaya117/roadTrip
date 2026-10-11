# Agentic Ticket Lifecycle

This guide describes the repository's ticket workflow from issue intake through
human verification. It uses the installed Codex skills and local ticket files;
the dashboard is an optional view over those files.

## Lifecycle

```text
Create → Investigate → Plan → Implement → Review → QA
       → Ready for Human Verification → Done
```

`Blocked` may be used when evidence or an external dependency prevents progress.
Resume a blocked ticket at the phase supported by the new evidence. A failed
review or QA pass returns the ticket to `Implementing` for repairs.

## 1. Create a ticket

Use `$create-ticket` to record a bug, request, or task. Ticket creation captures
the problem, expected behavior, reproduction details, acceptance criteria,
evidence, and unknowns. Creating a ticket does not authorize implementation.

Tickets are stored under `tickets/<TICKET-ID>/`. The normal work-ticket files
are:

- `ticket.md` — request, acceptance criteria, and evidence links.
- `state.json` — current lifecycle status and status history.
- `investigation.md` — observed behavior and investigation evidence.
- `plan.md` — implementation plan, task boundaries, risks, and checks.
- `qa-report.md` — acceptance results and test evidence.
- `verification.md` — the human's final approval or rejection.
- `agent-reports/` — specialist findings and implementation reports.

## 2. Discover the team

Before processing a ticket, run `$discover-team` and inspect
`.codex/ticketing/team-inventory.json` and
`.codex/ticketing/agent-routing.md`. Reuse registered repository agents and
skills where they fit. Document role assignments and actual delegation in the
ticket plan. Do not claim an agent ran unless it actually did.

## 3. Process the ticket

Use `$process-ticket <TICKET-ID>` only after implementation is requested. The
lead owns status transitions and integrates all work. Follow repository
`AGENTS.md`, the ticket skill, and the ticketing state machine.

The process should:

1. **Investigate:** trace the affected behavior, reproduce it when possible,
   and record commands, observations, and unknowns.
2. **Plan:** define scope, dependencies, file ownership, acceptance checks,
   tests, risks, and rollback steps. Inspect the working tree and preserve
   unrelated changes.
3. **Implement:** make only the approved changes and record factual specialist
   reports. Keep independent file ownership clear.
4. **Review:** obtain an independent review when the workflow and available
   agents support it; resolve actionable findings.
5. **QA:** evaluate each acceptance criterion and run the relevant checks.
   Record exact commands, outcomes, and limitations in `qa-report.md`.
6. **Prepare for human verification:** move to `Ready for Human Verification`
   only after QA evidence supports a pass. Never infer a pass from an agent's
   completion message or from a successful process exit alone.

### Keep acceptance progress current

Acceptance checkboxes in `ticket.md` are the dashboard's visible checklist.
Check an individual criterion (`[x]`) when the implementation and recorded
evidence show that criterion is met. Leave it unchecked while it is incomplete
or unverified. A checked box records criterion progress; it does not replace
the QA report or human approval. Keep ticket status and checklist state aligned
with the latest evidence.

## 4. Verify and finish

`Ready for Human Verification` means the work is ready for the requester to
inspect; it is not the completed status. The human must explicitly approve or
reject the result.

After personally verifying and approving the ticket, use `$verify-ticket
<TICKET-ID>` and state the approval. The workflow records the decision in
`verification.md` and sets the status to `Done`. The equivalent status command
after recording approval is:

```powershell
python .codex/ticketing/ticket.py set-status TKT-XXXX Done --human-approved
```

If the result is rejected, use `$verify-ticket <TICKET-ID>` and describe the
observed deviation. Record the evidence and return the ticket to
`Implementing`. Never impersonate the human verifier or infer approval from
silence. `Done` does not authorize merging, deploying, or closing external
work items.

## Dashboard

The optional AgentOps Ticket Dashboard reads ticket files and refreshes the
ticket list periodically. It displays:

- Ticket status from `state.json` and acceptance progress from the checked
  boxes in `ticket.md`.
- Active ticket counts inferred from workflow status. This is not a count of
  confirmed live Codex processes.
- Execution events only for Codex runs started through the dashboard. Runs
  started in another terminal or Codex task are not shown in its execution
  monitor, though their saved ticket changes appear when the files refresh.

From the target repository root on Windows, launch the shared dashboard with:

```powershell
& "D:\Projects\codex\agentops-ticket-dashboard\start.ps1"
```

Then open <http://127.0.0.1:8765>. The dashboard uses the signed-in Codex CLI
for runs it starts; it does not need a separate API key. See
`D:\Projects\codex\agentops-ticket-dashboard\README.md` for options and
troubleshooting. To point it at a different repository, pass `-Repo` with that
repository's path.
