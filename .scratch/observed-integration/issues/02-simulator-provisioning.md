# Establish supported fresh-simulator provisioning

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:research
Type: research
Mode: AFK
Status: resolved
Claimed by: provisioning-researcher
Triage: ready-for-agent
Blocked by: none
Agent role: provisioning-researcher
Skills: research, domain-modeling

## Question

Which supported pinned MobileBuildMCP capabilities can allocate, boot, install on, and account for a fresh dedicated simulator without touching quarantined devices?

## Agent brief

Use primary vendor source/docs and local pinned package metadata. Record exact supported operations, platform constraints, app artifact prerequisites, failure ambiguity, retention/cleanup limits and ADR-0002 implications. No device operations. Unsupported automation must remain an explicit gap, not an invented command.

Read the map Notes and blockers first. Claim before work. Work only on this ticket and its assigned evidence file; the coordinator owns shared map/contract edits. Findings are not production acceptance. Link evidence and append the resolution under `## Answer` only when the question is answered; never close a ticket merely because a report was drafted.

## Done when

The answer cites inspectable evidence, distinguishes facts from recommendations, identifies residual limits, and gives downstream agents concrete inputs. Any unsupported prerequisite stays explicit.

## Comments

Created during charting. No implementation authorization is implied by this planning ticket.

## Answer

Resolved 2026-10-08 by provisioning-researcher. [Supported simulator provisioning in the pinned device layer](../evidence/provisioning.md) records the inspected package/source evidence and exact command templates. Pinned MobileBuildMCP supports listing, booting and installing onto existing explicit UUIDs, plus destructive erase. It exposes no create/clone/delete or standalone shutdown tool. Exclusive allocation from a supplied dedicated inventory is feasible; fully automatic fresh creation remains an explicit unsupported prerequisite under ADR-0002. Downstream lifecycle planning must preserve uncertainty, existing quarantines and inventory provenance. No device operations were performed.
