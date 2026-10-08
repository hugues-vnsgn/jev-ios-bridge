# 11 — Execute serial public-interface live acceptance

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 09, 10
Owner: Existing sole Orca live operator
Pane: b0e5a4b6-106b-4dab-a49a-b3933445d4ef:1b178e31-086e-40c9-b4e2-b9a3dd45ad90
Model: gpt-6-luna
Effort: high
Skills: do-test, orca-cli, diagnosing-bugs
Expected commit: `test: record observed public-interface live acceptance`

## Dispatch contract and context

Read [the handoff](../../observed-integration/implementation-plan.md), [specification](../spec.md) and [validation matrix](../../observed-integration/evidence/validation-matrix.md), especially prerequisites and L01–L05. Root supplies the full integrated SHA, workspace, effective private configuration, successful migration/host reports and unchanged source/build provenance. Verify them before work. Execution starts on Root’s explicit ticket dispatch with the pinned integrated base and satisfied prerequisites. This ticket runs only in the named existing pane; preserve its model/effort. Root watches/fixes and never operates a second device.

## Write ownership

Allowed writes: `.scratch/observed-integration/acceptance/live/report.md`; `live/builds.json`; `live/allocations.json`; `live/versions.json`; `live/L01/**`; `live/L02/**`; `live/L03/**`; `live/L04/**`; `live/L05/**`; this issue's Status/Comments. The `live/` paths above are under `.scratch/observed-integration/acceptance/`.

Allowed runtime effects after Root’s explicit live-ticket dispatch: unchanged fixture/Weather generic simulator builds into isolated DerivedData, private acceptance harness output, and exactly the fresh public allocations/actions named by L01–L05. Generated staging/evidence and durable store updates are runtime outputs, never source edits. All source, shared host/safety artifacts, existing devices/claims and common handoff protected files remain protected. Operator stops while Root fixes code and resumes only on Root's new integrated SHA and affected-case instruction.

## Bounded work and acceptance

Root must first publish H01–H09 PASS. Build/inspect/hash the unchanged artifacts as the matrix requires; record prerequisites before allocation. Run L01–L05 serially through the specified CLI/MCP combinations using unique declared identities and fresh create-source allocations. Initial readiness checks require only the selectors expected initially; future postconditions and L03's deliberately absent precondition are checked by the submitted action, not made entry prerequisites. Record exact V/R/N/backend totals, real create stdout/stderr/exit, visible JPEG/snapshot agreement, authoritative retrieval and terminal export across processes. The L04 harness withholds a successful real touch reply at the specified synthetic boundary; raw success evidence must remain inspectable.

Acceptance: each L01–L05 oracle and effect count in the matrix passes; all five retained allocations and evidence versions are recorded. Reads/conflicts/retirement/refused successors have zero backend calls. No replay or source alteration supplies missing evidence. Stop on unexpected selector exposure, missing/incompatible prerequisites, unexplained counts, unknown creation, uncertain work or capacity exhaustion. Mark intended coverage UNVERIFIED or confirmed failure BLOCKED, with raw evidence; never allocate a replacement for that action. Preserve all named protected devices/claims. No stop/shutdown/reset/erase/delete, merge or publish.

## Return

Return PASS/BLOCKED/UNVERIFIED, full integrated/base and evidence-commit SHAs, changed evidence files, raw command/count links, per-row verdicts, limitations and unresolved prerequisites. Root integrates evidence. A synthetic lost reply is not real transport severance or native certification.

## Comments
