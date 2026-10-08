# Choose how dedicated simulator inventory is replenished

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: resolved
Claimed by: inventory-decision
Triage: ready-for-agent
Blocked by: 02
Agent role: provisioning-designer
Skills: codebase-design, domain-modeling, when-stuck

## Question

How should this integration obtain fresh dedicated simulators when the pinned provider cannot create them?

## Agent brief

Use [supported provisioning research](../evidence/provisioning.md) and the existing live fixture allocation evidence. Compare an explicit finite supplied inventory with a narrowly scoped simulator-creation adapter or provider extension. State the effect on autonomous operation, failure handling, dependencies and ADR-0002/ADR-0007. Inspect actual supported primary APIs before recommending any new command; use a separate research ticket if evidence is missing. Do not run device commands during planning.

Recommend a route that satisfies the owner's autonomous-operation goal; an inventory-only first slice must disclose that replenishment is external and cannot be called full provisioning. Record the chosen technical scope and required ADR change or retain the unresolved choice explicitly. Escalate to the owner only if alternatives require relaxing an established constraint, unavailable access, or an external commitment.

## Done when

The lifecycle designer has a supported source of dedicated simulator inventory, explicit exhaustion behavior, and the exact architecture decision needed. Creating another device never authorizes replaying an uncertain business action.

## Comments

Graduated from provisioning research during charting. Product code and live device operations remain out of scope for this map.

## Answer

Resolved 2026-10-08 by inventory-decision. [Dedicated simulator inventory replenishment decision](../evidence/inventory-decision.md) selects a narrow host adapter using the installed primary `xcrun simctl create <unique-name> <explicit-device-type-id> <explicit-runtime-id>` interface, then pinned MobileBuildMCP boot/install and observation. Read-only command help on Xcode 27.0 and the historical fresh-device allocation record support creation; no device operations were performed. Supplied finite inventory remains an explicit fixture/fallback source with external replenishment, not the autonomous default. A provider extension has no supported implementation in the pin.

The evidence includes draft ADR text for root to amend ADR-0002's operator-provisioning responsibility and add a creation-only exception, with an ADR-0007 scope cross-reference and no new UI transport. Resource reservations precede creation; lost replies may leave an unknown-UDID orphan and retain the pending operation without blind retry or name-based adoption. Exhaustion/prerequisite failures stop preparation before app action. Allocation IDs and business action IDs must be separate so changing devices never permits replay after uncertainty. Native callback unavailability does not block this supported observed-testing route. All four protected devices and their claims remain untouched. Ticket 05 must specify the exact budgets, ownership and preparation results; host fault and new public-interface live acceptance remain required before implementation is accepted.
