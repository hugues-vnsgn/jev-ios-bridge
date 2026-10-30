# Appium MCP migration implementation

Source: [published spec](spec.md)
Selected base: `0d3e54a9d1d80c1a9188c8c5e5717254e9a95994` (`v1.4.0`)
Branch: `feat/appium-mcp-migration`
Status: Phases 0 to 3 complete on main; Phase 4 agent-only kits started 2026-10-30; live runs and corpus judgments await owner steps

Status updated on 2026-10-30: use the [current roadmap and phase execution
plan](roadmap.md) for work-package order and exit criteria. The owner paused
implementation on 2026-10-13 and later resumed it; Phase 1 reached GO, Phase 2
completed and Phase 3 merged to main (evidence in the table). The confirmed
plan and published spec retain their decision and acceptance history.

| Phase | Result |
|---|---|
| 0. Baseline | Complete in `f95f4bec8`; [fresh evidence](baseline.md) |
| 1. Protocol feasibility | GO, 12 of 12 cases, 2026-10-19: [result](phase-1-result-20261018.md). The earlier [matrix and evidence gap](phase-1.md) is the 2026-10-14 checkpoint |
| 2. Configuration and ownership | Complete, 12 MET and 0 open bullets, main `4465e93e9`, PRs #56 to #67: [exit note](../appium-phase2/phase-2-exit.md) |
| 3. Adapter and mode compatibility | Merged to main, PRs #70 to #85, 2026-10-24 to 2026-10-26 (main `f9ce07854`, `git log --first-parent`): [map](../appium-phase3/map.md) |
| 4. Live acceptance and cutover | Agent-only kits started 2026-10-30. Live runs and corpus judgments wait for owner steps: [ticket 06](issues/06-acceptance-resource-readiness.md), [ticket 08](issues/08-frozen-state-correspondence.md), activation of the real admission store, the Jev key |

The owner separately requested implementation on 2026-10-12. That instruction
supersedes the spec's earlier documentation-only authorization context; its
scope, compatibility requirements, and firm gates still apply.

The final baseline check passed typecheck, all 2,258 tests, and build. The
clean-install/plugin proof passed, and both review axes found zero findings.
The [two-axis review](review.md) records the discovery verdict and pending gates.
At the 2026-10-14 checkpoint the migration was incomplete: production still used
the v1.4.0 device layers, and the admission authority and historical ownership
records were not migrated or changed. No merge, push, tag, or release was
performed. Since then Phase 3 has put the public composition on Appium (see the
table above). The real admission store is not activated, and no release has
been made.


Coding-agent follow-up: read the [Wayfinder decision map](map.md), then the
[master handoff and phase specifications](handoff.md). The handoff holds the
current status and makes unresolved decisions explicit.

## Owner-requested WIP checkpoint

The owner instructed work to stop on 2026-10-13. The in-flight iOS cancellation
case completed its own cleanup; the matrix controller cannot start another
case. Both private devices are verified shut down with closed owned ports.
They were not erased or deleted. A bounded stop audit found no surviving
recorded process incarnation or scoped command match. Shared ADB/CoreSimulator
services and other agents' devices were not stopped.

The [Phase 1 state](phase-1.md) distinguishes passing controls, failures, and
cases not run. Direct-child receipts leave escaped grandchildren unverified;
no experimental fence receipt counts as a complete gate-3 pass. The descendant
verifier is an untested draft, not integrated cleanup. Production authority,
existing quarantines, and leases remain unchanged.

Resume only when the owner asks. Next: complete and test bounded descendant
verification and persist its post-stop result; keep unverified cases
quarantined; resolve Android lost-creation reconciliation; rerun the required
matrix and review its evidence before issuing GO. Phase 2 and full adapter
construction have not started. This commit is a WIP checkpoint, not completion
of the published spec. No push, merge, or tag is authorized or performed.
