# Locate the MCP and reporting integration seam

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
Claimed by: seam-decision
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

Read-only charting audit returned [preliminary findings](../evidence/integration-audit.md). Claim released after bounded inspection. The ticket stays open: its accepted recommendation and complete decision inputs still require a working session.

## Answer

Resolved 2026-10-08 by `seam-decision`: choose an additive observed-action module shared by thin MCP and CLI adapters, with the seam above `runObservedTap`. Proposed `src/observed/service.ts:ObservedActionService` owns execution jobs, non-mutating inspection, cancellation/shutdown, evidence lookup and authoritative terminal interpretation; reuse/refactor `runObservedExperiment` behind it. Preserve `BridgeService.start/status/reportJson/cancel` as scenario operations and retain the pinned `MobileBuildMcpDriver.tapOnce` single-submission path.

The accepted [seam decision](../evidence/seam-decision.md) inventories exact symbols/call paths, rejects a new script step or mode flag for this slice, gives a concrete future write-set split, and names compatibility/fault checks. It identifies two essential traps: existing journal reads mutate quarantine, and even a completed record can precede failed finalization. Public polling must use a separate non-mutating authoritative resolver; provisional `result.json` cannot certify success. Observed outcomes remain visible evidence, distinct from Jev verdicts and native receipts.

Ticket 04 owns public names/schema/versions/exits. Tickets 03 and 05/08 still own shared admission, finalization/recovery and dedicated allocation/retention/inventory. The seam requirements constrain their interfaces without presuming their pending choices. This resolution is a planning decision based on code inspection, not implementation or live acceptance. Coordinator owns the map pointer and route rendering.
