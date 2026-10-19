# Appium migration master handoff

Status: specified requirements; execution paused
Updated: 2026-10-14
Worktree: `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.worktrees/feat/appium-mcp-migration`
Branch: `feat/appium-mcp-migration`
Evidence checkpoint: `7426f249121db87ba8b8151581f79187be80d8ee`
Roadmap checkpoint: `2f9ba8d4b`

## Start here

1. Read [the roadmap](roadmap.md), [the decision map](map.md), and current
   [implementation status](implementation.md). Check Git state before edits.
2. Use [the published spec](spec.md) as the acceptance authority. These phase
   specifications expand its requirements; they do not weaken or replace it.
3. For planning, take a named frontier decision ticket from the map and claim
   it before work. For implementation, require an owner resume instruction and
   the applicable phase entry evidence. The latest request authorizes specs
   and read-only research, not code, native cases, migration, or Jev calls.
4. Read only the phase relevant to the dispatch. Record a bounded work package,
   its expected public behavior, required tests, and evidence before coding.

## Destination and current state

Replace MobileBuildMCP and mobilecli UI automation with one bridge-owned Appium
MCP device driver. Preserve the bridge's scenarios, guards, Jev judgments,
admission, device lease, recovery, logs, reports, and public contracts.

```text
Bridge CLI/MCP -> existing scenario/observed services -> Appium device driver
                                                      -> private MCP process
                                                         -> XCUITest/WDA or UiAutomator2
```

Baseline repairs are complete. Phase 1 has real round-trip controls but no GO;
escaped-descendant coverage remains open and Android creation-loss reconciliation
failed in the corrected matrix. Phases 2 through 4 have not started. Production
still uses the selected v1.4.0 providers. Read [the checkpoint](phase-1.md)
for case results; 35 historical experiments are not 35 acceptance passes.

## Phase dispatch

| When working on | Read | Entry | Required output |
|---|---|---|---|
| Native feasibility | [Phase 1](phases/phase-1-feasibility.md) | Owner resume; proof-method decisions addressed | Reviewed GO/NO-GO with all required native receipts |
| Profiles and shared authority | [Phase 2](phases/phase-2-ownership.md) | Reviewed Phase 1 GO | Configuration, offline migration, authorization/recovery evidence |
| Adapter and preserved modes | [Phase 3](phases/phase-3-adapter.md) | Phase 2 controls before effects | Complete driver/public-mode compatibility evidence |
| Corpus/live acceptance and cutover | [Phase 4](phases/phase-4-acceptance.md) | Production Appium observation and composition proven | Corpus results, three-category live acceptance, Appium-only artifact |

Resolve open design decisions before calling their affected contract
implementation-ready. Internal module/file names and SQL representation may be
chosen by the implementer; public meaning, persisted history, and phase gates
are fixed. Keep decisions in their tickets and evidence in referenced artifacts.

## Accepted constraints

- Use private local stdio, explicit owned session identities, frozen resolved
  dependencies and runtime artifacts, and public `appium-mcp/core` interfaces.
  Use the small versioned extension where structured data is required. Keep
  remote/shared sessions, backend fallback, private imports, and vendor forks
  outside this release.
- Preserve version-1 scripted behavior, version-2 driven behavior, and existing
  experimental enablement/policies. Preserve observed actions' iOS-simulator-only
  single-tap scope, immutable outcomes and key-free operation.
- Preserve the existing per-user SQLite authority. Admission grants permission;
  device lease release requires durable closure, terminal/fenced commands, and
  verified loss of every owned automation component's ability to act.
- Keep uncertain execution inconclusive. Reconcile or retain quarantine;
  retrieval and recovery cannot replay input or rewrite immutable history.
- Keep ordinary scenarios' installed-app/already-booted-device preconditions.
  Retain explicit observed boot/install and bounded fresh-creation exceptions.
  Keep allocated devices and their capacity under the existing retention policy.
- Use Appium for all UI observation/input. Bounded native helpers may serve
  logs/health, owned fencing, optional nonfatal presentation, and existing
  bounded simulator creation only.
- Preserve public scripts, commands/tools, reason/role semantics, exit codes,
  JSON reports and evidence layout. An optional profile selector plus project
  default was selected by the owner; its contract is in Phase 2. New optional
  transport fields cannot invalidate existing requests.
- Preserve the pinned judge, 0.9/0.1 bounds, false-wins checkpoints, and one
  judgment per screen. Complete both frozen corpus gates and physical-Android
  acceptance before cutover.

Read ADR-0004/0005 for judgments/stability, ADR-0008/0009 for authority/allocation,
and ADR-0010/0011 for the migration architecture and native release predicate.
Use `GLOSSARY.md`: a run, Appium session, observed outcome, and device lease are
separate concepts. Keep test fixtures outside production authority.

## Device and data boundaries

After an owner resume, revalidate the privately created pair before effects:
iOS `40A5E14C-7B08-43A0-844A-76FB94B4B34A` in the exact set recorded in
[evidence](evidence/dedicated-device-preparation.json); Android
`jev_appium_phase1_20261013`, resolved to the attested emulator transport.
Port/serial reuse without identity proof is a refusal. Use one case at a time.

The other agent's `18pro` simulator and existing AVDs/phones are outside the
assignment. Keep shared ADB/CoreSimulator services running. Normal cleanup
permits no phone erase or allocated-simulator deletion. Research-pair shutdown
is separate from proving normal automation cleanup while the device stays on.

Preserve the original checkout's local edits. Keep secrets in the original
checkout's `.env`; when live judgment is authorized, use its explicit path and
never print, copy, commit, or forward the key to automation children. Mask typed
values in logs/errors. A real authentication failure is a blocker, not a key
replacement opportunity. Keep screenshots and raw local evidence under their
existing protection contract.

## Implementer completion report

Report the work package by name, source commit, changed behavior, focused/full
checks actually run, evidence paths, immutable state effects, phase-gate result,
and remaining blockers. Distinguish source/fixture support from live support.
For native work, link authorization, command counts, component completeness,
cleanup verification and retained uncertainty. Link every required acceptance
row or mark it failed/not run; never infer completion from a successful status.

Use pre-agreed public CLI/MCP/service seams with a controllable MCP provider,
existing judge injection, migration/race fixtures and contract goldens. Review
Standards and Spec separately at phase exits. Commit reviewable local work;
pushing, merging, tagging and publishing remain separate owner actions.

## Excluded later work

Allocation reclamation, physical-iPhone enablement, native measurements,
remote services and device farms have separate roadmap scopes. Preserving
bounded allocation preparation and testing a physical Android phone are part
of this migration. Do not turn the migration into a redesign of scenarios or
an app-under-test bug fix.
