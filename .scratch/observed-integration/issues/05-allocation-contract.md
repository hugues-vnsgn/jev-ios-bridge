# Define allocation and uncertain-device lifecycle

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
Claimed by: allocation-lifecycle
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

## Answer

Resolved 2026-10-08 by allocation-lifecycle. [Allocation contract](../evidence/allocation-contract.md) defines the allocator interface, exact preparation request/snapshot, shared durable records, budget defaults and per-user configuration, fresh creation and supplied inventory, readiness, cross-process admission transfer, crash handling and permanent single-use retention. It aligns with the public-contract owner on MCP/CLI names and separate immutable preparation/action digests. Global action reservation precedes creation; a fresh device cannot replay that declared action ID.

A creation with an unknown UDID retains capacity and a transactional host-wide guard: every new updated iOS admission refuses with `HOST_CREATION_UNRESOLVED`; existing admitted owners may finish. No automatic reconciliation, source substitution or capacity refund follows uncertainty. Installed compatible runtimes and unchanged simulator artifacts remain explicit host prerequisites. All four protected devices and their claims remain excluded.

No design question remains unresolved. Implementation, fault tests and fresh public-interface live validation remain acceptance gates, not evidence supplied by this planning answer. Native proof, broad cleanup/reclamation and external-tool fencing are outside scope. The coordinator owns map/domain/ADR consolidation; only this ticket and its assigned evidence were edited.
