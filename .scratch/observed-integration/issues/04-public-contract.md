# Choose the observed-action public contract

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
Claimed by: public-contract
Triage: ready-for-agent
Blocked by: 01, 03
Agent role: contract-designer
Skills: codebase-design, domain-modeling

## Question

What additive public contract exposes observed actions while preserving legacy meanings and the single-attempt rule?

## Agent brief

Compare alternatives using the two audits. Specify versioning, request validation, run lifecycle, cancellation, authoritative terminal results, four observed outcomes, evidence pointers, errors and migration. Require non-mutating polling, authoritative terminal reads, and a key-free deterministic entry point. Record technical decision and alternatives. Escalate only a genuine scope/guarantee change to the owner; no invented HITL exchange.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.


## Answer

Resolved 2026-10-08 by `public-contract`: choose additive version-1 observed interfaces through shared `ObservedActionService`, with exact request/snapshot/error schemas, MCP names, CLI names/exits, key-free startup/enablement, read-only polling, authoritative terminal retrieval, durable cancellation and restart rules in [public contract](../evidence/public-contract.md). The decision cites actual CLI/MCP/service and experimental executor behavior plus ADR-0005; scenario/script/verdict/report meanings remain frozen.

Declare actionId globally during preparation, reserve allocationId separately, and bind immutable preparation/action digests in the transactional store. Identical submissions retrieve; changed input/allocation/device conflicts; lost replies, crash, cancellation and uncertain creation never allocate a replacement or replay. Coordinated [allocation contract](../evidence/allocation-contract.md) supplies exact preparation/state/outcome schemas, retained inventory, parked ownership transfer and host-wide unknown-create guard. Explicit action and allocation cancellation avoid polymorphic results and remain available when feature enablement is off.

Committed outcomes are distinct from unresolved authority and provisional files; attempted/acknowledged flags can remain unknown. Four outcomes are visible evidence, never Jev verdicts or native receipts. Exact schemas and bounded interfaces are decided; downstream implementation/fault/live gates and migration/external-operator prerequisites remain explicit. No product implementation, tests, device operations or owner scope change occurred. Coordinator owns shared map/spec/domain/ADR integration.
