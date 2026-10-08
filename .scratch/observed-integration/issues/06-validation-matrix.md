# Specify broader live evidence and acceptance gates

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: claimed
Claimed by: validation-plan
Triage: ready-for-agent
Blocked by: 04, 05
Agent role: validation-planner
Skills: do-test, domain-modeling

## Question

What bounded host and live matrix is enough to accept the integrated workflow, and which claims remain untested?

## Agent brief

Specify public-interface tests, cancellation/crash/concurrency/persistence failures, ordinary/no-input/uncertain/refused flows, one additional unmodified app flow where a runnable artifact exists, and runtime coverage. Name evidence and command counts; separate wrapper reply loss from real transport failure. Assign all live operations to the chosen Orca pane with serial device ownership.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.
