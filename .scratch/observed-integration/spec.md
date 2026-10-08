# Observed iOS workflow implementation specification

Status: implementation-ready plan; independent Spec and Standards reviews passed.
Product baseline: `2ae75e5`. Planning execution started from `2fb08d8` on `feat/native-callback-diagnostic`. This document specifies future behavior; no new public API, allocator, admission store or migration has been implemented or live-validated by this planning effort.

## Destination and scope

Let an agent prepare a fresh dedicated simulator, submit one authored tap against an unchanged app, and retrieve an honest visible outcome through installed CLI/MCP entry points. The bridge coordinates its updated iOS entry points through durable admission and keeps uncertainty across restarts. Root orchestrates implementation and fixes integration; the existing Orca pane owns live simulator work.

First scope is iOS simulator tap only, deterministic before/after guards, one action per allocation, installed host runtimes, and supplied simulator-compatible app artifacts. Keep legacy scripted/driven verdicts and Android behavior. Observe without Jev; legacy assertions retain their model and credential requirements. Broader actions, physical devices, new UI transports, native ownership/settlement/release certification, automatic uncertain replay, and cleanup/reuse of retained allocations are outside this slice.

## Normative decisions

Each contract lives in one document. Implementers must read the rows relevant to their ticket; this index does not replace their schemas or state tables.

| Concern | Authoritative document | Implementation obligation |
| --- | --- | --- |
| Module seam and compatibility | [Observed-action integration seam](evidence/seam-decision.md) | One observed service above the executor, shared by thin adapters; existing scenario service stays scenario-specific. |
| Admission, migration and terminal authority | [Admission decision](evidence/admission-decision.md) | Shared transactional iOS admission, canonical identity, non-mutating reads, conservative import, dispatch fencing and atomic result/disposition. |
| Supported provider capabilities | [Provisioning research](evidence/provisioning.md) | Do not invent creation/shutdown/delete commands in pinned MobileBuildMCP. |
| Creation architecture exception | [Dedicated inventory decision](evidence/inventory-decision.md) | Narrow argument-array `simctl create` exception; pinned provider retains preparation and UI operations. |
| Public schemas and semantics | [Observed public contract](evidence/public-contract.md) | Exact CLI/MCP requests, outputs, enablement, identity, cancellation, error/exit behavior, and evidence authority. |
| Allocation lifecycle and configuration | [Allocation contract](evidence/allocation-contract.md) | Exact budgets, app staging, global reservation, creation guard, readiness, parked handoff, single-use retention and errors. |
| Acceptance | [Host and live matrix](evidence/validation-matrix.md) | Host H01 through H09 and live L01 through L05 with named evidence and declared limits. |

The public/allocation contracts refine the earlier suggested internal interfaces, especially action reservation before a UUID exists and cross-process preparation cancellation. Their coordinated schemas are authoritative for those refinements. The shutdown correction in the allocation contract governs parked readiness. If a remaining contradiction affects an invariant, record it on the implementation ticket and return to root; do not silently choose whichever is easier.

## Domain distinctions

Use **observed action** for the authored tap attempt, **observed outcome** for its deterministic visible-evidence result, and **observed evidence** for its local captures and authoritative result references. These do not replace Scenario, Run, Verdict or Report in the existing glossary.

**Device admission** is bridge authorization to operate a canonical device. It is distinct from Device lease and never proves the glossary's strong native release invariant. **Device allocation** assigns one dedicated simulator to one declared action. A **prepared allocation** has completed preparation and parked its ownership for one action; a **retained allocation** cannot return to inventory in this slice. **Unknown creation** means a device may have been created without its identity being durably known.

Action identity is global within the per-user store and distinct from allocation identity. Exact duplicate requests retrieve state; changed bound input conflicts. The bridge cannot detect a semantically repeated business operation deliberately renamed under another ID.

## Integration rules

1. The admission store owns authority. Use one private local per-user root, the specified SQLite transaction discipline, immutable bindings and migration metadata. Never use evidence-folder location or temporary leases as an alternate admission domain.
2. Reservation precedes creation; device admission precedes device-affecting preparation. Updated legacy/capture paths consult shared admission too. Unknown creation blocks new iOS admission until a separate ownership reconciliation exists; normal execution cannot clear that guard.
3. Single submission remains inside the existing `tapOnce` path. No adapter may route observed taps through ordinary retrying `act`, resubmit on stale/lost replies, or replace the allocation for the same action.
4. Status is non-mutating. Candidate/export files cannot manufacture committed success. Failure before authoritative commit retains unavailable admission; lost response after a verified committed terminal permits retrieval only.
5. Prepared ownership transfer is durable and generation-checked. The ready commit removes preparation from the process-owned active job set. Normal CLI exit leaves parked readiness intact; explicit allocation cancellation/retirement may retire it.
6. Cancellation prevents subsequent dispatch authorization. Already authorized work may still act. Unknown work retains uncertainty; late callbacks and process cleanup cannot reopen quarantine.
7. Preserve all protected study devices and claims. External tools, older binaries, other OS users and nondeclared historical roots remain outside updated-process enforcement; migration requires operational quiescence, not a guessed PID-based proof.

## Architecture and documentation work

Root owns the ADR updates during implementation: document transactional shared admission and the deliberate Node built-in SQLite dependency, and separately document bounded simulator creation. Amend ADR-0002's operator-only provisioning language and add ADR-0007's cross-reference without expanding its UI-input exception. Number the new ADRs against the target branch at integration time.

Root records the terms above in the canonical domain glossary without weakening existing definitions; the documentation worker supplies proposed wording but does not edit shared domain files. If the target branch still uses `CONTEXT.md` as the glossary, preserve its content when establishing `GLOSSARY.md` and leave a compatibility pointer. Ship a guide for opt-in enablement, migration prerequisites, allocation budgets, evidence lookup and uncertain-state behavior. Existing retained allocations are not repaired or removed as a documentation step.

## Implementation and completion

[Implementation plan](implementation-plan.md) owns work packages, dependencies, agent/model/effort settings and write sets. Concrete execution issues live under [observed-action rollout](../observed-action-rollout/spec.md). Before dispatch, root pins the reviewed planning commit and gives each agent an isolated worktree from the integrated dependency head. Never branch a worker from unrelated main state.

The implementation is merge-ready only after the host matrix, clean installed CLI/MCP checks, unchanged legacy contracts, public-interface live evidence and independent review pass. Baseline 965 tests and prior fixture runs are historical evidence, not substitutes. Actual implementation results belong under the acceptance paths defined by the matrix; every acceptance row starts UNVERIFIED.

This handoff does not itself merge, publish, modify an app, operate a simulator, or declare the older native-certification tickets accepted. New implementation tasks are separate from the resolved planning questions.
