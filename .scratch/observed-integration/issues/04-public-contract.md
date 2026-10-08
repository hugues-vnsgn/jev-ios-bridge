# Choose the observed-action public contract

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: open
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
