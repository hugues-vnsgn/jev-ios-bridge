# Specify broader live evidence and acceptance gates

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
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

## Answer

Resolved the planning question in [the acceptance matrix](../evidence/validation-matrix.md). The plan binds host gates to the public/allocation/admission contracts, assigns host evidence to Root and every live operation to the sole selected Orca pane, and specifies five fresh retained allocations with an eight-allocation ceiling. It covers both new public adapters, fixture ordinary/no-input/refused/synthetic-uncertain cases, Weather Settings using existing source selectors, authoritative retrieval, exact command categories, migration, minimum Node 24.0.0, packaging and compatibility gates.

Existing fixture live results and the 965-test baseline remain historical facts; every new acceptance row is UNVERIFIED until execution. Weather requires a fresh unchanged-source simulator build and verified capture selectors; the historical device/build command is prohibited. Synthetic reply withholding remains distinct from real transport failure and native proof. No tests, builds, device operations or product changes were made. Coordinator owns the map update and ticket 07 handoff.
