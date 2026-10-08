# Locate the MCP and reporting integration seam

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: open
Triage: ready-for-agent
Blocked by: none
Agent role: integration-auditor
Skills: codebase-design, domain-modeling

## Question

Which existing service, CLI, MCP and report boundaries can expose observed actions without changing legacy script, verdict, cancellation, or evidence meanings?

## Agent brief

Inventory actual symbols and call paths; compare an additive observed-action interface with a new script step. Cite local files/lines, identify compatibility traps, recommend the smallest shared runner boundary, and list regression checks. Do not choose a new public contract or implement it.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.
