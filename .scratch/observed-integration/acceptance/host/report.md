# Observed workflow host acceptance — PASS

## Current work

Tickets01–10 and their bounded repairs are integrated. Current product commit is `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`. The actual default `npm run check` passes **1675/1675 tests**, typecheck and build on Node26.8.1 and exactNode24.0.0, with zero failures, cancellations, skips or TODOs. Source hashes match before/after each command. [Raw combined gates](faults/integration/full-gates/root-preservation.json).

Ticket09 original `08a9858` and focused child `d0c24bb` are integrated. Both scoped review axes PASS; the cancellation and early-signal proof gaps are closed. [Bounded integration and preserved failures](faults-repair2-review.md). Root's separate controlled-clock fixture repair `6610b136` retains the1100ms budget and exact polling assertions; its own reviews/default1482 checks on both runtimes PASS. [Clock repair](boot-poll-repair/report.md).

Ticket10 candidate `a319e5b` is accepted. The latest unchanged genuine Node26 clean install/plugin proof passes37 commands in18.351s, using a new empty project and independent empty cache. The genuine exactNode24 proof passes37 in21.514s;71 current source/package/lock/README and68 compiled-file correspondences associate both successful proofs with current Root. [Installed proofs, startup supplements and original negatives](installed-workflow/integration/fresh-proofs/report.md).

Both contemporaneously wrapped installed-production startup probes pass. Two CLI and three MCP retrievals return safe `STORE_UNAVAILABLE` when `Admission.open` throws before any account-root access. SDK/driver/child and actual account-root effects remain0. These prove production factory translation. Actual isolated SQLite faults are separate evidence.

## Row state

Each manifest now maps ticket09's396 inventory IDs to193 executed added tests per runtime, plus2 installed startup supplements and H09 proofs. The inventory is not396 independently executed tests. [386 deduplicated runtime artifact groups](faults/artifact-groups.json) carry raw trace hashes, process exits and explicitly shared fixture-aggregate counts; missing trace counts are null with source-assertion provenance.

The [first independent completeness audit](faults/review/host-completeness/original/review.md) was BLOCKED on eight base01–08 mapping omissions, with no new product defect. Root added all eight as explicitly separate direct/shared-module supplements:26 Source anchors,302 assertion-line annotations and70 in-range test-title definitions matched to BOTH actual1675 passing logs. [Supplement correspondence](base-supplements/correspondence.json). These are existing executions, not new per-variant CLI/MCP raw traces.

The [corrected independent completeness review](faults/review/host-completeness/round2/review.md) is PASS. All twelve reviewed map hashes and cited Source hashes remained unchanged before/after review. Root preserved the reviewed maps, then added only top-level acceptance annotations. [Acceptance receipt](host-acceptance.json) records those metadata deltas. [Post-gate issue metadata](faults/integration/root-acceptance-metadata.json) separates Root's ticket09 acceptance comment from the nine exact reviewed test/fixture paths and accepted clock Source.

The [installed/startup raw correspondence audit](installed-workflow/review/final-raw-correspondence/review.md) is PASS. All366 reviewer files are copied with SHA256 verification; both37-command proofs,71 Source and68 compiled correspondences and both contemporaneously wrapped startup probes are independently verified.

| Rows | Verdict | Evidence manifest |
| --- | --- | --- |
| H01/H02 | PASS | [Schemas/envelopes](schema.json) |
| H03/H04 | PASS | [Identity/allocation](identity.json) |
| H05 | PASS | [Cancellation](cancel.json) |
| H06 | PASS | [Crashes](crash.json) |
| H07 | PASS | [Storage](storage.json) |
| H08 | PASS — isolated migration | [Migration](migration.json) |
| H09 | PASS — local supported runtimes/installed proofs/compatibility; CI configuration inspected | [Runtime](runtime.json), [packaging](packaging.json), [compatibility](compatibility.json) |

Root accepts complete H01–H09 host evidence within the recorded isolated/fake/injected/local limits. This does not grant live, native, operational migration, remote-CI or final safety approval. Original BLOCKED reports and both frozen map snapshots remain inspectable.

## Preserved negatives and limits

- Both original corrected09 defaultNode26 runs remain1667/1668 FAIL at the old wall-clock fixture. Later controlled-clock/composed passes are separate runs.
- Both earlier fresh RootNode26 installs remain FAIL at command003 under the unchanged90s deadline. The lower cause remains UNVERIFIED. Separate archive diagnostics passed identically without warming acceptance caches.
- Original09's3176 indexed raw files and prior48-trace audit disappeared when temporary directories were cleared. Fresh corrected evidence does not reconstruct them. Root preserved30835 fresh regular files, including all30765 indexed raw files, and25 symlink-target records with SHA256 verification.
- Injected SQLITE_FULL is not a physically full volume; isolated historical migration does not establish operational old-writer quiescence; fake window counts do not prove actual presentation or native release. Remote CI is configured but was not run.
- Historical source-review and command receipts retain their original scope and pending statements. The current report provides the later state without rewriting their results.

## Remaining execution order

1. H01–H09 are complete and independently audited PASS. Preserve and commit the acceptance evidence before live handoff.
2. Restore and verify the dedicated sibling operator with the approved `gpt-6-luna` high settings. The current Orca inventory contains Root's original pane; the previously approved sibling leaf is absent after restart. Root remains coordinator.
3. Verify installed iOS27.0, truthful old-writer quiescence and declared/excluded historical roots, effective private configuration and migration before production admission. The owner chose to wait for iOS27.0; no fallback or runtime installation is authorized.
4. The sole operator builds unchanged fixture/Weather artifacts into isolated DerivedData, verifies compatibility/hashes/capacity and runs L01–L05 serially, retaining all five allocations and all raw evidence. No replacement supplies a failed or uncertain case.
5. Ticket12's independent nonauthor safety reviewer audits the final integrated diff and all H/L evidence before Root issues a merge-ready verdict.

No production store activation, device cleanup/replay, main merge, push or publication has occurred in this work.
