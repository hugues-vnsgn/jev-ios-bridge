# Choose how dedicated simulator inventory is replenished

Parent: [Observed actions from live experiment to agent workflow](../map.md)
Label: wayfinder:task
Type: task
Mode: AFK
Status: open
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
