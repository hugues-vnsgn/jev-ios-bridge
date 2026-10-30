---
updated: 2026-10-30
status: phases-0-to-3-complete-phase-4-started
implementation: phase-4-agent-only-kits-approved
evidence-checkpoint: 7426f249121db87ba8b8151581f79187be80d8ee
---

# Appium migration roadmap and execution plan

As of 2026-10-30, Phases 0 through 3 are complete: Phase 1 is GO, Phase 2 is
complete and Phase 3 is merged to main. The production Appium adapter is built
and the public composition runs through it. Phase 4 has started for agent-only
work. Its live runs and corpus judgments wait for owner steps listed in the
table below. The evidence for each phase is in the table. The 2026-10-14
planning update that paused implementation is superseded by the owner's resume
instructions; its text below stays as history.

This document makes the [confirmed plan](plan.md) executable without changing
the [published spec](spec.md), accepted architecture, or release requirements.
[Implementation status](implementation.md) records completed work;
[Phase 1 evidence](phase-1.md) records the current experiment results.

```text
0 Baseline [done]
  -> 1 Feasibility [current; incomplete]
     -> 2 Profiles and ownership
        -> 3 Appium adapter and mode compatibility
           -> 4 Corpus/live acceptance and cutover
              -> Replacement release ready for owner review

Later, separate scopes: 5 Reclamation | 6 Physical iPhone | 7 Measurements
```

Coding-agent follow-up: read the [Wayfinder decision map](map.md), then the
[master handoff and phase specifications](handoff.md). The handoff holds the
current status and makes unresolved decisions explicit.

## Current position

| Phase | Evidence-backed status | Required next result |
|---|---|---|
| 0 | Complete in `f95f4bec8`; baseline release checks passed | Retain the repaired baseline |
| 1 | GO, 12 of 12 cases (Android 6/6, iOS 6/6), 2026-10-19: [result](phase-1-result-20261018.md) | None |
| 2 | Complete, 12 MET and 0 open bullets, main `4465e93e9`, PRs #56 to #67: [exit note](../appium-phase2/phase-2-exit.md) | None |
| 3 | Merged to main, PRs #70 to #85, 2026-10-24 to 2026-10-26 (main `f9ce07854`, `git log --first-parent`): [map](../appium-phase3/map.md) | None |
| 4 | Agent-only kits started 2026-10-30. Live runs and corpus judgments not done | Owner steps: [ticket 06](issues/06-acceptance-resource-readiness.md), [ticket 08](issues/08-frozen-state-correspondence.md), activation of the real admission store, the Jev key. Then both corpora and all three device categories pass before old backends are removed |
| 5 through 7 | Later milestones outside this replacement-release spec | Separate implementation scope and evidence |

The 35 recorded experiments are history, not a progress denominator. Every
native case still has the complete-component release condition open. A passing
tap, deletion, or experimental fence receipt cannot close that condition.
The WIP typecheck passed, but its latest targeted run passed 21 of 22 tests;
there is no final full-suite or final review verdict for the WIP.

## Phase 0: preserve the baseline

Use the selected v1.4.0 source and the separate baseline repair commit. Do not
restart baseline work or count its host-test pass as Appium acceptance. Keep
the older main-branch/release-history difference as an integration prerequisite.
See [baseline evidence](baseline.md) and Spec Decisions 1 and 2.

**Exit already met:** documented baseline, bounded repairs, and relevant
release/package checks. Future changes still require their own checks.

## Phase 1: prove operation and safe stopping

**Question:** can the pinned stack observe, act, and stop all owned automation
without replaying uncertain work or disturbing another device?

Resolve [Complete-coverage mechanism](issues/07-complete-coverage-method.md)
before treating the descendant draft as the fix. Research shows that a final
scan needs a prior completeness argument; unobserved escape cannot be repaired
by another empty inventory. The detailed [Phase 1 specification](phases/phase-1-feasibility.md)
sets the proof and NO-GO requirements.

| Work package, in order | Deliverable | Completion evidence |
|---|---|---|
| 1A. Complete component verification | Tested ancestry recording and one bounded post-stop verification in cleanup | Detect escaped/reparented grandchildren and private command markers; unverifiable components or scan deadlines retain quarantine; foreign/shared services are not stopped |
| 1B. Resolve Android lost creation | Explain the zero-session reconciliation result and correct the fault/recovery path | Existing receipts establish the cause; a controlled lost-reply case creates at most once and reconciles owned work or retains truthful uncertainty |
| 1C. Stabilize the experiment | Resolve the host inspection failure; freeze source, schemas, stack, artifacts, and budgets | Targeted host checks pass; result status requires every required cleanup proof; draft code receives review |
| 1D. Run the final matrix | Six cases on each private platform: normal, lost creation, lost action, cancellation, late reply, MCP failure | All 12 cases use the reviewed source/protocol and record command counts, uncertainty, component verification, and native cleanup |
| 1E. Review feasibility | One indexed GO/NO-GO report with linked receipts | Every required item passes; reviewers can verify all three release conditions from evidence |

Start with host-controlled descendant tests: escaped grandchildren, parent
death, changed process incarnation, marker matches, unavailable inspection,
and an independent process that remains untouched. After a parent exits, a
post-stop parent scan alone cannot recover an already orphaned descendant;
capture enough identity before stopping to verify it afterward. The existing
descendant verifier is an untested draft, not accepted proof.

Run one native case at a time across the private pair until inspection timing
is reliable. Inspect its completed receipt before starting another. Do not
queue a whole matrix behind an unresolved failure or edit sources during a
case. A failure leads to diagnosis against its retained evidence, not automatic
mutation replay. Freeze corrections before another qualifying matrix run.

**Exit:** Spec Testing Decision 21 passes on both platforms. Dispatch is
durably closed, every issued command is terminal or fenced, and every owned
automation component is stopped or unable to act. Prove normal automation
cleanup while the device remains running; later private-device shutdown cannot
substitute for that proof. Verify safe subsequent use of the private pair.
An unreachable case may remain quarantined, but it is not a release proof.

**Boundary:** demonstrate the mechanisms here. Extend the production admission
authority in Phase 2; the disposable research journal cannot replace it.

## Phase 2: profiles, admission, and recovery

**Entry:** reviewed Phase 1 GO. See Spec Decisions 9 and 18 through 22, ADR-0008,
and ADR-0011.

| Work package | Deliverable | Completion evidence |
|---|---|---|
| 2A. Configuration and preflight | Named profiles, app/device identity, platform capabilities, and bounded timeouts | Invalid/conflicting inputs cause no mutation; existing defaults, device options, launch arguments, intent extras, and budgets retain their meaning |
| 2B. Canonical identity and offline migration | Extend the existing per-user SQLite authority to Android | AVD/serial aliases converge; historical actions, outcomes, quarantine, exclusions, receipts, and retained capacity survive; interrupted/corrupt migration fails closed |
| 2C. Authoritative lifecycle | Record command authorization, owned components, closure, fence evidence, and explicit recovery in that authority | No release before all three conditions; late replies cannot change immutable outcomes; missing sessions/processes never clear historical uncertainty |
| 2D. Exclusion and recovery tests | Cross-process races and crash/recovery fixtures | One owner across entry points and environment/path aliases; an uncertain owner blocks another run; complete supported evidence permits safe subsequent admission |

Keep ordinary scenarios' installed-app and already-booted-device preconditions;
they gain no implicit boot, provisioning, reset, or erase. Observed preparation
retains only its existing authorized exceptions. Reserve physical-iPhone
configuration needs without enabling that later capability.

Implement and test migration on isolated fake stores first. Applying it to the
real per-user store requires an explicit offline window with all relevant
writers stopped and historical roots declared or excluded. Do not declare
quiescence for an active agent or create an alternate production store. A new
feasibility receipt cannot settle an old quarantine or release retained
allocation capacity.

**Exit:** compatible preflight, preserved migration state, and ownership/recovery
tests pass before any integrated production device effects. Old binaries and
external tools still require operational exclusivity.

## Phase 3: adapter and complete mode compatibility

**Entry:** Phase 2 ownership controls. Use the existing driver contracts,
factories, services, and public CLI/MCP boundaries; a small successful tracer
does not establish complete driver behavior.

| Work package | Deliverable | Completion evidence |
|---|---|---|
| 3A. Protocol and observation | Production private MCP transport, validated extension, XML normalization, screenshots, and provenance | Invalid results fail safely; roles/values/frames/references and observation limits remain compatible; no credential or raw typed-value leakage |
| 3B. Actions and fresh evidence | Unique targeting, guards, replacement text, shown values, settling, gestures, and Android coordinates | Missing/ambiguous/stale targets dispatch nothing; authorized mutations dispatch once; changing screens remain marked; coordinate conversion works on two sizes |
| 3C. Scripted and driven modes | Existing scenario execution, hand-backs, paused ownership, and `resolve_step` through Appium | Both public transports preserve replies, exits, reports, policies, and fresh-screen checks; existing iOS attach/coordinate refusals remain explicit |
| 3D. Observed actions and preparation | Supplied inventory, bounded fresh allocation, parked transfer, action/retrieval/cancellation paths | Existing iOS-only single-tap scope, immutable outcomes, one executor, key-free operation, unknown-creation guard, and eight-allocation retention survive |
| 3E. Capture and diagnostics | Android capture, app logs/health, watch, presentation, and report integration | Capture issues no app restart/stop, screenshot, or Jev request; logs mask values; expected shutdown differs from app failure; unsupported/lost detection stays truthful |

Test representative existing scripts through the actual adapter and services
with a controllable MCP provider. Reuse public contract goldens and judge
injection. Cover success, refusal, cancellation, reply loss, and recovery for
each preserved mode within its existing platform scope. The distinct
preparation/action factories and Android capture path must participate;
replacing only the ordinary scenario factory is insufficient.

Native helpers remain limited to logs/health, owned fencing, optional
presentation, and existing bounded simulator creation. They cannot provide
alternate UI observation/input. Keep old source only as a development reference
until cutover, with no runtime backend selector or fallback in the target.

**Exit:** the complete preservation matrix and relevant public-contract checks
pass. A previously valid script cannot be downgraded to unsupported to finish
the adapter. A frozen-contract break requires the separate major-version
process, not a changed test expectation.

## Phase 4: acceptance, then cutover

**Entry:** production observation and mode composition from Phase 3. See Spec
Testing Decisions 22 through 24.

| Work package, in order | Deliverable | Completion evidence |
|---|---|---|
| 4A. Frozen assertion corpora | Matching Appium XML/screenshots through the production normalizer, renderer, and pinned Jev judge | iOS: 24 screens/48 claims, zero confidently wrong, at most three uncertain; Android: 10 screens/31 claims, zero confidently wrong |
| 4B. Live compatibility | Capability matrix on iOS simulator, Android emulator, and an explicitly assigned physical Android phone | Preserved behavior, logs/health, shown values, coordinate geometry, competition, loss/disconnection, and cleanup; at least 20 independent session/scenario cycles per category without accumulating owned sessions |
| 4C. Remove old execution paths | Appium-only composition and dependency/setup audit | No MobileBuildMCP, mobilecli UI path, AXe input, or hidden old factory/capture route; required history readers and allowed helpers remain |
| 4D. Release readiness | Full checks, built package/plugin, clean-install evidence, tested capability docs, and integration proposal | Checks and artifact validation pass; release-history reconciliation is concrete; the owner receives reviewable release material |

Recover the Android corpus with its history and the `2366759` placeholder
correction. Preregister state correspondence and requests before Jev calls;
judge each screen once without re-asking. Changed or unreproducible states block
evaluation until the owner agrees reconciliation. Do not change labels,
denominators, or the pinned judge to obtain a pass.

Run observed actions only in their existing iOS-simulator scope. Preserve or
explicitly map the five unfinished baseline simulator acceptance cases. The
20-cycle requirement here is session/scenario cleanup, not allocation deletion.
Hardware that is connected but not assigned is unavailable for acceptance;
simulator success cannot stand in for the required Android phone.

**Exit:** both corpora and all required live categories pass before removing
the old backends. Then repeat affected checks against the Appium-only artifact.
Publishing, pushing, merging, and tagging require their own owner instruction.

## Later phases: separate deliverables

**5. Allocation reclamation.** Add a resource-cleanup lifecycle after supported
ownership settlement: durable cleanup claim, bounded owned-device work,
verified completion, then capacity release. Preserve immutable action records
and tombstones. Exit with at least 20 allocation/action/cleanup cycles under
the eight-allocation limit; unknown creation or cleanup retains capacity.
Normal replacement-release cleanup must not acquire this deletion behavior.

**6. Physical iPhone.** Establish signing and WDA artifact provenance, explicit
phone identity, the complete driver capability matrix, native stopping and
recovery, and physical-device acceptance. Exit before advertising support;
simulator evidence and reserved profile fields are insufficient. No erase is
implied by Appium session ownership.

**7. Native measurements.** Plan separate benchmark/profiling runners with a
defined workload, repeated measurements, raw traces, device/build provenance,
and comparable baselines. Start with a separately scoped metric rather than
all metrics at once. Exit with repeatable evidence on supported hardware;
Appium command duration remains automation timing, never app performance.

## Dependencies and execution discipline

Check these readiness risks early after the owner resumes; do not postpone
discovering them until the last acceptance run:

- An exclusively assigned Android phone and diagnostic app build for Phase 4.
- Reproducible frozen iOS/Android screen states and Android corpus provenance.
- A coordinated offline migration window that preserves other agents' work.
- Host/runtime prerequisites and a reliable bounded process-inspection path.

Keep one roadmap status and one evidence index rather than deriving completion
from experiment names. Complete each work package with its focused checks and
reviewable evidence, then commit it. Run relevant targeted tests during work,
and full checks at meaningful phase exits; any intervening change needs its
affected checks again. Report work-package progress without treating it as a
phase GO. Do not advance the phase on unresolved required findings.

**Next package (2026-10-30):** the Phase 4 agent-only kits. The 2026-10-14
planning update that stopped at package 1A, descendant verification, is
superseded: Phase 1 later reached GO. The kits run no device case, corpus
judgment or release action; those wait for the owner steps in the table above.
