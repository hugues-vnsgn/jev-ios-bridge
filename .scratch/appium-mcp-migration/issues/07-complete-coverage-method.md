# Complete-coverage mechanism

Type: grilling
Status: resolved
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium migration handoff map](../map.md)
Blocked by: 01

## Question

Which enforceable launch/registration/observer or inertness boundary can qualify complete native ownership on the required host, given that polling and final scans cannot prove escaped-grandchild coverage?

## Required discussion

Compare feasible mechanisms against shared-service exclusions, observer gaps, permissions/entitlements, runtime dependencies, startup/closure races and unavailable-host behavior. Preserve the accepted complete-component predicate. If none can be qualified, specify NO-GO and the design prerequisite; do not relax the gate.

## Completion criterion

Record the actual owner decision, enforceable constraints, unresolved limits and required phase-spec changes. Keep a source recommendation separate from an accepted method or live result.

## Context

- [Research evidence](../research/component-coverage.md)
- [Master handoff](../handoff.md)

## Comments

Charted from research on 2026-10-14. Implementation remains paused.

## Owner decision, 2026-10-18

Use pinned-stack proof. Every process started by the pinned Appium stack carries an inherited run marker and launch-time parent-chain evidence bound to process incarnation. Stop the recorded owned processes, apply the existing on-device fence, and perform one bounded post-stop scan for the marker, exact device IDs, and owned ports. Unknown or unverifiable leftovers retain quarantine.

Accepted residual risk outside Phase 1 is code that deliberately hides itself by clearing the marker, transferring raw descriptors or Mach rights, or escaping a sandbox. H05 marker-removal, H07, and H08 are excluded. This is the owner's explicit proof scope, not an absence claim about hostile code.

Move concurrent creation, close/dispatch races, and authority ordering (H01–H03, H11, P3, P4) to Phase 2 packages 2C and 2D. Phase 1 retains per-case at-most-one creation, no replay, and closure before abort.

Authority: owner resume instruction and phase1-finish-plan-20261018/brief.md. This decision supersedes the prior open proof-method question and the open-ended Phase 1 proof plan.

Escaped OS platform binaries with no recorded link are invisible to the marker on this Mac; this is accepted residual risk, and the on-device fence still removes their device access.
