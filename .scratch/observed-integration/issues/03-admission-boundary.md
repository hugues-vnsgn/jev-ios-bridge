# Audit admission and quarantine across runners

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: open
Triage: ready-for-agent
Blocked by: none
Agent role: admission-auditor
Skills: codebase-design, diagnosing-bugs

## Question

How can the normal agent interface preserve durable observed-action quarantine when legacy runners and external tools do not consult the experimental journal?

## Agent brief

Trace observed and legacy claims, preparation, cancellation, result finalization and crash recovery. Separate enforceable in-process/bridge guarantees from external operator exclusivity. Recommend boundaries and meaningful fault/concurrency tests; never equate host admission with native release.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.
