# Audit admission and quarantine across runners

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
Claimed by: admission-decision
Triage: ready-for-agent
Blocked by: none
Agent role: admission-auditor
Skills: codebase-design, diagnosing-bugs

## Question

How can the normal agent interface preserve durable observed-action quarantine when legacy runners and external tools do not consult the experimental journal?

## Agent brief

Trace observed and legacy claims, preparation, cancellation, result finalization and crash recovery. Separate enforceable in-process/bridge guarantees from external operator exclusivity. Specify atomic ownership-aware admission across observed and legacy bridge entry points, canonical identity, and non-mutating status; a check-then-acquire sequence is insufficient. Recommend meaningful fault/concurrency tests; never equate host admission with native release.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.

Read-only charting audit returned [preliminary findings](../evidence/admission-audit.md). Claim released after bounded inspection. The ticket stays open: its accepted recommendation and complete decision inputs still require a working session.

## Answer

Resolved by admission-decision on 2026-10-08. [Admission decision](../evidence/admission-decision.md) specifies the shared iOS admission module, transactional SQLite storage, canonical per-user identity/root, read-only status, ownership tokens, atomic terminal/disposition commit, monotonic quarantine and late-command prevention. A host-only temporary-directory harness reproduced both dead-PID legacy quarantine bypass and active-claim mutation by reads; no device operations or product edits occurred.

All updated observed and legacy paths must acquire before preparation; compatibility lease files provide only best-effort exclusion of old live processes. Prior writers must be quiescent for conservative journal migration. Older binaries and external tools remain outside enforcement and require exclusive dedicated-device operation. Node 24.0.0 documents the chosen built-in SQLite interface as active development; minimum-runtime and fault tests are explicit implementation gates. Observed outcomes remain visible evidence, never native release or Jev verdict certification.

The evidence defines interfaces, state transitions, migration/corruption behavior, authoritative readers and the regression matrix for downstream public-contract/allocation/handoff work. No weaker guarantees, app changes or transport expansion are proposed. Coordinator owns the map update and future ADR/spec edits.
