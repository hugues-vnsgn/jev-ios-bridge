# Preliminary admission and quarantine audit

Date: 2026-10-08. Baseline: `2ae75e5`. Source inspection only; these are integration hazards to reproduce, not newly verified runtime failures.

| Source | Finding | Required design input |
| --- | --- | --- |
| `src/experimental/observed-journal.ts:begin`; `src/device/lease.ts:DeviceLease.take`; `src/device/index.ts:prepareIssued` | Observed quarantine and legacy leases are independent; legacy preparation does not consult the journal. | Shared admission must cover bridge-owned legacy and observed entry points before preparation. |
| `src/device/lease.ts:130`; `src/device/index.ts:551` | Legacy leases reclaim dead-PID holders; iOS preparation assumes no sweep. | Process death must not erase observed uncertainty. Older binaries and external tools remain outside enforcement. |
| `src/experimental/observed-journal.ts:69–84` | Status/read reconcile by quarantining existing claims or unfinished intents. | Separate non-mutating status from explicit recovery. |
| `src/experimental/observed-tap.ts:60–92` | Journal admission precedes preparation; preparation can launch the app. | Preserve this ordering for every bridge entry point. |
| `src/experimental/observed-tap.ts:bounded`; `src/device/index.ts:issueCommand` | Cancellation can return before the underlying operation settles. | Cancellation must not imply native input stopped or device released. |
| `src/experimental/observed-tap.ts:104`; `src/scripted/run.ts:519`; `src/device/index.ts:831` | Inconclusive observed execution skips finish; legacy execution cleans up, sometimes with late lease release. | Quarantine must survive cleanup and late acknowledgements. |
| `src/experimental/observed-run.ts:51`; `src/experimental/observed-journal.ts:110` | Provisional result may exist before failed finalization. | Only authoritative terminal state can support completed success. |
| `src/experimental/observed-journal.ts:key`; `src/device/lease.ts:121`; `src/experimental/observed-run.ts:deviceId` | Journal hashes exact identity, leases normalize uppercase, experiment schema normalizes UUIDs. | Share canonical device identity and admission root across entry points. |

Recommended module: ownership-aware atomic admission with distinct acquire and read-status interfaces. A journal check followed by lease acquisition has a race and is insufficient. Keep operational exclusivity requirements for external tools explicit.

Required checks: observed/legacy acquisition race; uncertain action then new legacy process with zero backend calls; UUID casing; polling without state mutation; cancellation at each phase; late cleanup; finalization failure after provisional success; uncertain allocation retained while an independent device remains usable.

Exact accepted design and implementation are still pending in the linked planning tickets.
