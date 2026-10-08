# Define allocation and uncertain-device lifecycle

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: open
Triage: ready-for-agent
Blocked by: 03, 08
Agent role: lifecycle-designer
Skills: codebase-design, domain-modeling

## Question

What lifecycle gives an automated agent a fresh exclusive test simulator and accounts for failures without silently reusing uncertain devices?

## Agent brief

Define ownership records, allocate/boot/install failures, restart behavior, allocation budgets, app artifact discovery, cleanup eligibility and retain/quarantine states using supported operations. Explicitly address the difference between provisioning another device and replaying the same business action. Distinguish assignment from existing dedicated inventory from creation of a new simulator. If creation is unsupported, choose an explicit inventory-based first slice or leave creation blocked pending an accepted ADR-0002 extension. Record any ADR-0002 amendment needed.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.
