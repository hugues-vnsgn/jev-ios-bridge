# Agent plan for observed-action integration

Status: charted route; public contract and implementation briefs are not yet settled.

Start from [the map](map.md). Read a ticket's blockers and claim it before doing its work. The map and tickets own decisions; this file owns dispatch and handoff rules.

## Planning waves

| Wave | Ticket | Delegate | Skills | Return |
| --- | --- | --- | --- | --- |
| Parallel discovery | [Locate the MCP and reporting integration seam](issues/01-integration-seam.md) | Integration auditor | codebase-design, domain-modeling | Code inventory, alternatives, compatibility checks |
| Parallel discovery | [Establish supported fresh-simulator provisioning](issues/02-simulator-provisioning.md) | Research agent | research, domain-modeling | Cited supported operations and limits |
| Parallel discovery | [Audit admission and quarantine across runners](issues/03-admission-boundary.md) | Admission auditor | codebase-design, diagnosing-bugs | Failure cases, shared admission requirements |
| Parallel design after respective blockers | [Choose the observed-action public contract](issues/04-public-contract.md) | Contract designer | codebase-design, domain-modeling | Versioned request/result and lifecycle decision |
| Inventory source after research | [Choose how dedicated simulator inventory is replenished](issues/08-inventory-replenishment.md) | Provisioning designer | codebase-design, domain-modeling, when-stuck | Supported inventory source, exhaustion behavior and ADR scope |
| Parallel design after respective blockers | [Define allocation and uncertain-device lifecycle](issues/05-allocation-contract.md) | Lifecycle designer | codebase-design, domain-modeling | Ownership, failure, retention and allocation decision |
| Evidence plan | [Specify broader live evidence and acceptance gates](issues/06-validation-matrix.md) | Test planner | do-test, domain-modeling | Host/live matrix and explicit limits |
| Handoff | [Assemble and review the parallel implementation handoff](issues/07-implementation-handoff.md) | Root, then independent reviewer | writing-for-agents, project-organization, code-review | Spec and bounded implementation tickets |

## Proposed implementation sequence

This is a scheduling sketch, not an accepted schema or a set of ready implementation tickets. The handoff ticket replaces it with exact write sets after the decisions are resolved.

```text
Accepted contract, inventory-source and lifecycle decisions
  ├─ admission + authoritative result handling ─┐
  └─ simulator allocation adapter ──────────────┤
                                               ↓
                              root integrates shared runtime
                                               ↓
                 ┌─ MCP / CLI adapters + contract tests
                 └─ isolated host fault tests + operator docs
                                               ↓
                                    root runs integrated checks
                                               ↓
                     Orca live operator runs acceptance matrix
                                               ↓
                          independent review → root fixes → merge-ready
```

| Work package | Primary skills | Ownership and acceptance |
| --- | --- | --- |
| Admission and result handling | cook, tdd, codebase-design | One agent owns journal/admission changes. Tests prove restart/concurrent entry refusal and authoritative terminal outcomes. No native-release claim. |
| Fresh simulator allocation | cook, tdd, diagnosing-bugs | Separate adapter owned by another agent after research/design. Test allocation ambiguity, app installation failures, budget limits and retained ownership. Delegate live checks to Orca. |
| Agent-facing adapters | cook, tdd | One owner for MCP/service/CLI shared files. Verify legacy contract compatibility, cancellation, all four observed outcomes, and evidence retrieval. |
| Fault tests and operator docs | do-test, writing-for-agents, unslop | Separate tests/docs owner. Change public files only through their owner. Validate the new entry point rather than only the internal runner. |
| Live acceptance | do-test, orca-cli; diagnosing-bugs on failure | Existing user-selected Codex pane is sole device operator. Capture raw commands, screenshots, terminal records and versions on fresh owned devices. |
| Review and integration | code-review, do-test; diagnosing-bugs for defects | Independent reviewer reports findings. Root integrates and fixes; rerun affected checks after changes. Merge readiness is distinct from publishing. |

## Dispatch contract

Every implementation brief must include:

- Ticket and blocker links; accepted decisions; exact base commit and isolated worktree.
- One named owner, explicit allowed write set, and protected shared files.
- Required skills and only the evidence/context needed for this ticket.
- Observable acceptance checks, expected failures, and evidence output paths.
- Stop conditions: missing supported provider operation, real authentication failure, contradictory contract, or uncertainty requiring prohibited replay. Return the evidence; do not substitute a fake success.
- Return format: outcome; commit; changed files; checks with results; evidence links; limitations; unresolved dependencies.

Root owns shared specs, dependencies, integration commits and final verdict. Use at most three child agents concurrently. Shared-file dependencies take priority over filling slots. Research uses its own `research/` branch; implementation uses isolated feature/fix worktrees from the accepted integration base. Never have two agents cherry-pick into the integration branch.

The live operator receives the integrated commit hash and an explicit device allocation before execution. Root reads evidence and fixes code. A lost reply or quarantine ends that attempt; allocating another device never authorizes repeating its business action. Existing retained devices and claims remain untouched.

## Completion gates

The plan is implementation-ready only when every planning ticket has an evidence-backed answer and the handoff review finds no missing prerequisite. Implementation is merge-ready only after compatibility checks, the agreed host matrix, live public-interface evidence, and independent review pass. No gate accepts native certification through screenshots or host process completion.

## Charting review

2026-10-08: an independent planning agent found no blockers in the dependency graph, skill assignments, source hazards or provisioning limits. All local Markdown links resolve; the route renderer accepts all eight tickets. This review accepts the chart, not the still-pending implementation spec. Only the provisioning research ticket is resolved.
