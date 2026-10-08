# 02 — Import historical admission state offline

Type: task
Status: resolved
Claimed by: migration implementer (/root/migration_readiness)
Execution: base 8d8c5a0f582d025eab9da85611b0d38ce6c377f2; feat/observed-offline-migration
Mode: AFK
Blocked by: 01
Owner: Migration implementer
Model: gpt-6-astra
Effort: high
Skills: cook, tdd, codebase-design, use-git-worktree
Expected commit: `feat: add conservative offline admission migration`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Admission](../../observed-integration/evidence/admission-decision.md): migration/coexistence and initialization marker. [Public contract](../../observed-integration/evidence/public-contract.md): historical read-only allocation IDs.

## Write ownership

Allowed writes: `src/device/admission.ts`; `src/device/admission-sqlite.ts`; `src/device/admission-migration.ts`; `src/device/admission-maintenance.ts`; `tests/admission-migration.test.ts`; `tests/fixtures/admission-migration/**`; this issue's Status and Comments only.

Protected shared files: `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `src/experimental/**`; `src/observed/**`; `source journals/claims`; `src/cli.ts`; `src/mcp/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Implement the explicit offline maintenance entry at packaged dist/device/admission-maintenance.js, guard and manifest, conservative enumeration/import of historical journals and leases, alias consolidation, retained protected exclusions and one-time read-only historical allocation identities. Distinguish fresh initialization from missing initialized storage. Require operational old-writer quiescence and declared non-default roots; cannot prove quiescence by mtimes. Preserve source bytes. Expose activation validation through admission, so subsequent driver work can refuse before effects.

## Acceptance and stop criteria

H08 and H07 migration subsets: dead/live/malformed leases, quarantine plus apparent completion, aliases, unfinished intent, corrupt/unattributable data and unquiesced source all produce the required retention/refusal. Source fixtures remain byte-identical; rerun 01 tests and typecheck.

Completion: A successful manifest enables updated entry points; unsafe imports stay closed. Return exact maintenance invocation and prerequisites for docs. Transfer store ownership to 03 only after Root integrates. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### Implementation started — 2026-10-08

Verified the assigned isolated worktree and base. Applying Cook (existing approved plan, autonomous execution), TDD, codebase-design, use-git-worktree and do-test. Root owns independent review and shared tracker rendering; no subordinate agents or protected documentation edits. Agreed test seams are offline migration plus admission activation/read/acquisition against real temporary SQLite and fake backends. Vertical slices: explicit initialization/activation; conservative journal and lease imports/replay identity; source/guard/install failure paths; packaged maintenance entry and minimum-runtime regression. Source bytes, imported identity stability and zero authorization after unsafe imports are the oracles from the admission decision and Root guidance above.

### Root implementation guidance — 2026-10-08

Read-only preparation mapped the actual journal writer in `src/experimental/observed-journal.ts`, wrapper intent in `observed-tap.ts:60–62`, default/custom roots in `observed-run.ts`, and shared iOS/Android lease format in `src/device/lease.ts`. Enumerate records directly; never call historical readers or lease acquisition because they can mutate/reclaim state.

- Conflicting historical bindings of one action ID across different devices refuse activation; do not pick a winner. Same-device case aliases merge conservatively.
- Persist once-assigned read-only imported allocation IDs behind a typed store seam for ticket03. They reserve replay identity but confer no prepared capability. Preserve original intent/result and source references; do not fabricate a new public request digest, evidence directory or readiness.
- Completed-looking results with a remaining claim, quarantine, unfinished intent or other uncertain source state remain uncertain. Validate actual record shapes; the old journal accepts arbitrary JSON.
- Account for interrupted publication `.tmp` records. UUID-attributable malformed leases retain that device. Well-formed matching non-UUID lease records may be classified as non-iOS and preserved without blocking Android; genuinely unattributable/conflicting records refuse activation. Document the classification and its limitation; do not silently discard unreadable data.
- Use an explicit versioned maintenance manifest for operational old-writer quiescence, source roots and exclusions. The declaration is an operator assertion, not process/native proof. Include default roots plus declared non-default roots, including differing historical home/TMPDIR contexts. A missing explicitly declared source is not silently empty.
- Preserve marker-present/missing-database refusal and partial-installation refusal. A marker inside the admission directory cannot detect deletion of that entire directory; do not claim otherwise or automatically rebuild missing state. Backup/restore and root deletion remain documented operational limitations.

Implementation dispatch still requires integrated ticket01 and a pinned SHA. This preparation does not authorize dependent source edits before that handoff.

### Implementation result — 2026-10-08

**PASS — bounded offline migration host behavior.** Base `8d8c5a0f582d025eab9da85611b0d38ce6c377f2`, branch `feat/observed-offline-migration`. Root integration and independent review remain pending; no real store, source claim, device, app or secret was accessed.

Implemented explicit maintenance declaration, exclusive migration guard, transactional import/manifest, marker-before-database initialization, conservative journal/lease enumeration and case consolidation, protected exclusions and persistent read-only historical allocation IDs. Source bytes remain unchanged. A clean terminal only finishes its matching source-directory intent; another casing directory's unfinished copy remains uncertain. Existing admission handles validate the guard and persisted manifest on every store operation. Interrupted installation does not recreate storage; a crashed importer retains its guard, and changed-source reimport of initialized state stays guarded.

Applied Cook (approved plan/autonomous scope), TDD, codebase-design, use-git-worktree, do-test, and code-review's Standards/Spec checklist. Root's no-subagent instruction governs review: this is an author self-review, followed by Root's independent review. The unavailable simplify skill was replaced by a scoped manual depth/duplication review; removed redundant lease classification logic. Shared plan/journal/route edits remain Root-owned. Test seams are migration and admission, using real isolated SQLite, real short-lived child processes and fake backend capabilities; no SQL access is exposed to consumers.

| Coverage | Verdict and evidence |
| --- | --- |
| Explicit initialization, versioned declaration, stable receipt, test/real separation | PASS; migration tests |
| Original records, once-assigned imported allocation IDs, global replay refusal | PASS; migration tests |
| Aliases, quarantine/claim/unfinished/temp records, conflicting bindings and outcomes | PASS; migration tests, including red/green split-terminal regression |
| Dead/live/malformed/temp iOS leases and matching non-UUID lease classification | PASS; migration tests |
| Protected UUIDs and declared exclusions | PASS; migration tests |
| Quiescence/root assertions, declared missing roots, additional roots, source/destination overlap | PASS; migration tests |
| Invalid JSON/hash/symlink/unknown/empty/unreadable sources, byte invariance | PASS; migration tests |
| Guard across existing handles and independent reader, partial installation, missing DB/invalid manifest/marker/permissions | PASS; migration tests |
| Real importer SIGKILL at marker, precommit and postcommit milestones | PASS; migration tests; guard remains closed |
| Maintenance JSON/error surface, compiled Node 24 help | PASS; maintenance test and compiled-entry smoke |

Checks (all from this worktree):

- `node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts`: Node 26.8.1, exit 0, **77/77** tests (42 core + 35 migration), zero failures/skips.
- `/var/folders/yd/86fjng8s4hbfhcz7_0yqcl9w0000gn/T/jev-observed-node24-_o2st3ld/node-v24.0.0-darwin-arm64/bin/node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts`: exit 0, **77/77**, zero failures/skips.
- `npm run typecheck`, `npm run build`, `git diff --check`: exit 0.
- Node 24 compiled `dist/device/admission-maintenance.js --help`: exit 0; expected built-in SQLite experimental warning. Missing invocation under Node 26: expected exit 3 and safe `INVALID_REQUEST` JSON.

Raw logs: `/tmp/jev-migration-evidence-XmqMkh/`. TDD captures `01` through `07` red/green slices and `10-alias-red.log` / `10-alias-green.log`; final gates are `final-node26.log`, `final-node24.log`, `final-typecheck.log`, `final-build.log`, `maintenance-node24-help.log` and `maintenance-invalid.log`. Node reports test-case counts, not individual assertion-call counts. No full host acceptance, packed-install gate or live operation is claimed here; Root owns those gates.

Maintenance invocation (documented, **not run against production**):

```sh
node dist/device/admission-maintenance.js migrate /absolute/path/to/declaration.json
```

Declaration:

```json
{"version":1,"writersStopped":true,"historicalRootsDeclaredOrExcluded":true,"additionalJournalRoots":[],"additionalLeaseRoots":[],"excludedDevices":[]}
```

Prerequisites: installed/built package on Node 24.0.0+, operationally stopped old writers, exclusive updated-bridge device operation, readable historical roots, all non-default home/TMPDIR/custom roots declared or all affected UUIDs excluded. Current historical defaults are always included; explicitly declared missing roots fail. Destination is fixed to the OS-account admission root; no destination override, API key or device backend is used. Exit 0 emits one receipt; refusal exits 3 with safe JSON. The declaration is an operator assertion, never native/process proof.

Handoff to 03 after Root integration: `Admission.activation()` validates/returns the committed receipt; `readImportedAction(actionId)` and `readImportedAllocation(allocationId)` return `ImportedObservedAction | undefined`, with original records/source hashes, canonical device, stable UUID and `readOnly: true`, without a new request digest or readiness. `imported_actions.id` reserves historical action identities; allocation reservation must consult it, including before a device is known, and include imported allocations/devices in its eligibility checks. Core acquisition already refuses imported IDs in observed/preparation namespaces. Clean historical terminal outcomes are preserved separately from device disposition; protected/uncertain devices are quarantined. No generic SQL callback or release capability is exposed.

Limits: no old-writer/native fence; non-UUID matching lease classification is not platform attestation; no automatic guard recovery/reimport or repair of partial initialized storage; deleting the entire root or restoring an older backup is not detectable by the local marker and invalidates guarantees. Historical records exceeding the bounded 16 MiB per-file reader refuse import. Existing old/external operators remain outside enforcement. Requested ownership transfer: admission/migration store files to ticket03 only after Root integrates this commit.

### Independent-review corrections — 2026-10-08

The independent review superseded the initial bounded PASS with two confirmed defects at `0b06c1be391aa3a33e208e709c7b29ba245dc222`: P1 source validation could fail before the guard and leave initialized admission usable; P2 opening a recognized lease FIFO blocked before descriptor validation. Both are now fixed with actual red/green regressions. **PASS for the corrected bounded host scope; Root re-review/integration remains pending.**

Applied diagnosing-bugs, TDD and do-test under the existing Cook execution. The supplied review already established the mechanisms; after reproducing the exact symptoms in isolated-store tests, broad hypothesis generation and instrumentation were unnecessary. No debug instrumentation was added. P1 now performs only destination/source separation checks before guard acquisition; source existence, type and readability validation runs under the guard. A refused rerun therefore retains the guard for unsafe symlinks (including dangling links), missing explicitly declared roots and unreadable roots. Separation and unsafe-destination refusals still make no source/guard writes. P2 uses `O_NONBLOCK | O_NOFOLLOW` and validates the opened descriptor as a regular file, covering replacement races that an earlier lstat alone would miss.

Regression evidence under `/tmp/jev-migration-evidence-XmqMkh/`:

- `review-fixes-red.log`: the existing-handle acquisition assertions failed for unsafe/missing roots; FIFO child exceeded its 2000 ms limit and required SIGKILL. The unreadable-root case already passed and remains protected.
- `review-dangling-red.log`: dangling source-root symlink reproduced the same pre-guard admission bypass.
- `review-fixes-green.log`: all six focused cases passed, including source/destination overlap. `review-separation.log` proves a source alias of the admission directory and a permissive destination receive no guard or changed bytes.
- `review-fifo-original-green.log`: the independent review's original reproduction script returned `STATE_UNAVAILABLE`, exit 3, no timeout/signal and no fresh guard retained, in 95 ms (previously timed out at approximately 2000 ms).
- `review-final-node26.log` and `review-final-node24.log`: the unchanged core-plus-migration commands above each passed **83/83 tests** (42 core + 41 migration), no failures or skips; the bounded FIFO test completed in approximately 118 ms on both runtimes. Node reports test counts, not assertion-call counts.
- `review-final-typecheck.log`, `review-final-build.log`: exit 0. `git diff --check`: exit 0.

Changed scope for this correction is only `src/device/admission-migration.ts`, `tests/admission-migration.test.ts` and these issue comments. Maintenance invocation, declaration and typed ticket03 handoff are unchanged. No real store, device, source claim or secret was accessed. No new live or full integration acceptance is claimed.
