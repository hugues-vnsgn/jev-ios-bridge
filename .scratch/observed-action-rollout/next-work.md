# Remaining observed workflow execution

## Active resumption: 2026-10-11

Sam is ready: ownership is enabled and `/Volumes/Sam/jev-ios-bridge-release-2026-10-11/{build,staging,archive}` are private uid501/gid20/mode0700 directories. Root audited the33-file setup record. [Workspace audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-sam-namespace-audit.json).

The first offload is complete. The JetBrains cache is preserved in a verified 2.18 GiB archive on Sam; its 100 manifest entries were removed internally after a separate verified rename. Root audited the removal journal, rehashed the retained archive, and verified the operator's 24-file evidence bundle. [Offload audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-jetbrains-offload-audit.json).

The latest storage snapshot reports **23.73 GiB internally** and **124.93 GiB on Sam**. Internal storage still needs **36.27 GiB** to reach the unchanged 60 GiB simulator requirement. Sam exceeds the 70 GiB staging requirement; archive plans preserve staging and build headroom. These are measured snapshots, not final production gate acceptance. [Storage audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-post-jetbrains-storage-audit.json).

Next, the sole operator is archiving exact old Gradle versions 8.13 and 9.7.1 serially, after fresh activity checks. Their allocated sizes total 15.15 GiB; recovery is not claimed until verified removal and measurement. Active Gradle 9.1.0, shared caches and wrapper distributions remain excluded. Other candidate caches and the 12.48 GiB `.konan` tree still require selection and activity/content assessment. No build, device operation, migration rerun or release action has occurred during storage work.

Use the [current resume runbook](storage-resume-runbook.md) and [prepared execution brief](remaining-execution-brief.md). They supersede stale operator/migration instructions. Build commands remain unexecuted. Current public-interface command recording, including the L04 pre-acknowledgement loss boundary, remains a preparation dependency; the historical experimental harness is insufficient.

The owner explicitly approved resuming the remaining live roadmap: “ok, follow the map and go ahead”, following the stated compatibility → operational entry → L01–L05 → final review order. This supersedes the earlier deferral for these stages; it does not authorize merge, push or publication. Code/package acceptance remains complete. Root restored the sole GPT-6.1-Sol xhigh operator after the prior pane disappeared at restart and verified all 443 Source, 69 compiled and 15 preserved host files against the accepted final manifest. Actual metadata compatibility passed. Operational entry passed configuration, migration and capacity, then stopped at insufficient disk space. Live cases await storage and builds. Current binding: [2026-10-11 Root binding](../observed-integration/acceptance/host/live-resume-2026-10-11/root-binding.json). Historical deferral/status sections below describe earlier checkpoints.

### Current live checkpoint

Actual iPhone17/iOS27.0 metadata compatibility PASS on macOS27.0.1/Xcode27.0 build27A266a/runtime24A434. Root audited775files,165successful child closes,422metadata reads and26fresh read-only proofs across the two legacy mounts and Cryptex mount; all443Source/69compiled/15host references preserved. [Accepted compatibility](../observed-integration/acceptance/host/live-resume-2026-10-11/root-compatibility-v3-audit.json).

The earlier workspace-write DiskManagement refusal and two preparation failures remain preserved. The same read-only mount query succeeded through supported elevated execution. The owner delegated routine approvals to Root.

Operational configuration is accepted with unchanged defaults, effective digest `0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d`. Root corrected a handoff error that had supplied an old source-file hash as the configuration digest. The sole operator tightened only the app-owned state directory from0755 to0700, with held-descriptor identity checks and verified close. The original refusal receipts are preserved.

Once migration passed: installation `d411f7ce-9db6-4aa7-9c86-f337e739020a`, four imported actions and four retained devices, ten historical files preserved. Capacity passed with zero current allocations/bytes and all four protected identities quarantined.

**Current blocker: storage.** The production helper reported17,591,939,072bytes (16.38GiB) available on both relevant paths. The five-case plan requires60GiB on simulator storage and70GiB on staging storage, including the20GiB free floor and10GiB staging allowance. Staging shortfall is57,569,988,608bytes (53.62GiB), before build margin. No build, reservation or device action ran. Free additional storage while preserving evidence/stores/protected devices; then the sole operator must freshly verify storage and finish builds. Do not repeat migration or weaken budgets. [Entry evidence](../observed-integration/acceptance/live/entry-2026-10-11-v2/), [digest correction](../observed-integration/acceptance/host/live-resume-2026-10-11/root-config-digest-correction.json), [resume checkpoint](../observed-integration/acceptance/host/live-resume-2026-10-11/resume-checkpoint.json).

Read-only workspace attribution completed: Orca project workspaces17.37GiB, including integration5.13GiB; integration `.scratch`4.86GiB and `node_modules`0.21GiB; original checkout0.76GiB. Totals overlap and cannot be summed or treated as reclaimable capacity. They do not resolve the53.62GiB deficit. No cleanup was performed. [Attribution audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-disk-attribution-audit.json).

## Owner scope update: 2026-10-10

The owner said “ignore iOS 27 checks” and then approved proceeding with the displayed code/package plan. For this execution, actual iOS27 compatibility, operational entry/migration/app builds and liveL01–L05 are deferred, not passed. Continue installation diagnosis, candidate clean37/startup on both Nodes, exact integration, fresh integrated host/distribution checks, and final review of the completed code/package scope. Report deferred live acceptance explicitly; do not claim full original rollout acceptance or perform native/account/device work. No merge, push or publication is authorized.

## Current checkpoint: approved code/package scope complete

Tickets01–10 and the original H01–H09 are accepted. Live ticket11 remains deferred at the owner's request. The latest allocator/runtime repair passed independent Spec and Standards reviews with zero findings and2258/2258 author tests on each exact Node version.

The package blocker now has a passing validation setup: `npm_config_maxsockets=1`. The unchanged full helper passed all37 commands on Node26.8.1 and24.0.0, with zero skips and forbidden effects. Both guarded startup proofs passed2 CLI commands and3 MCP calls with zero SDK/driver/account effects. Root independently hashed52155 manifest files, recorded28 links without following them, and verified every69-file compiled payload plus both archives on each runtime. [Candidate package audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/tracked-candidate-installed-maxsockets1/root-audit.json).

Root integrated the reviewed four files at `5629e45778af71a9d1fc6aee616ea7d8e24920a3`. The first fresh Node 24 check failed two timing assertions; the unchanged focused cases passed. Root corrected three fixture files to wait for signal-handler readiness, parse child output after close, and measure the separate finalization interval. Existing outcome, effect and cancellation assertions and time limits remain. Both independent [Spec](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-fixture-review/spec.md) and [Standards](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-fixture-review/standards-final.md) reviews passed with no material findings. The correction is committed at `48d4b95e319a2c1b24480be6f008f208acf4327c`.

Fresh full checks passed 2,258/2,258 tests, typecheck and build on Node 26.8.1 and exact Node 24.0.0, with zero failures or skips. Fresh clean npm/plugin proofs passed all 37 commands per Node using `npm_config_maxsockets=1`. Both guarded startup proofs passed 2 CLI commands and 3 MCP calls with zero SDK, driver or production-account effects. Those gates bind the 443-file source at `48d4b95e319a2c1b24480be6f008f208acf4327c`, including the three reviewed fixture corrections. [Fresh integrated evidence](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-tracked-final-gates/root-audit.json).

The independent review found one material documentation conflict: ADR-0007 still described every Simulator-window failure as nonfatal and excluded presentation from the lease ledger. Root corrected that one ADR at `70169e87fa59113f1353c61fb90dfe1fc7bf5f2b`. Both Nodes then passed 34 documentation/packaging unit checks and 31 existing fake Simulator-window tests. Production code and package contents remain identical to the fully checked product. Current source has four declared differences from the frozen candidate: the three fixtures and ADR-0007; 439 candidate paths match, 435 protected paths and all 69 compiled files remain preserved. The original 15 host artifacts are unchanged. [Documentation delta binding](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-adr-review-correction/root-audit.json). The earlier full/package proofs retain their exact source association and were not repeated for this ADR-only correction.

The independent nonauthor GPT-6-Astra high review inspected planning base `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` through final correction/evidence revision `a387e4926147e68a85f84c3142f14737bcd9b41f`. Its review commit `664ffad972eff42b2722fa6754f257031c1445b9` is integrated. [Safety review](../observed-integration/acceptance/safety-review.md): code/package PASS under `maxsockets=1`; Standards P2 closed, two P3 design advisories remain nonblocking; Spec has zero confirmed defects, with a bundle-validation advisory and explicit-recovery qualification recorded. Root accepts the completed code/package scope. Actual iOS compatibility, production configuration/migration, app builds and L01–L05 remain deferred and unverified; full original ticket12 and release readiness remain incomplete.

Earlier package failures remain preserved and unexplained. The successful controlled single-connection diagnostic and package gates establish results under `maxsockets=1`; they do not establish the cause of default-concurrency stalls. The original4fa Node24 test failure also remains unexplained. [Single-connection diagnostic audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/tracked-packaging-single-socket-diagnosis/root-audit.json), [prior failure audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/tracked-packaging-latest-diagnosis/root-audit.json), [directly recorded timeout](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/tracked-packaging-node-reproduction/root-audit.json), [rejected local-address workaround](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/tracked-packaging-local-address-diagnosis/root-audit.json).

No owner decision is pending. The sole live operator stays idle and must be rebound before later native work.

## Current execution order

| Order | Work | Status |
| --- | --- | --- |
| 1 | Product fixes, both review axes, clean package/startup and integrated host checks | Complete; exact evidence above |
| 2 | Actual iPhone17/iOS27.0 metadata compatibility | PASS |
| 3 | Operational configuration, once migration and capacity | PASS; corrected effective digest recorded |
| 4 | Storage and unchanged fixture/Weather generic builds | BLOCKED:23.73 GiB internal;60 GiB required. Sam staging has124.93 GiB |
| 5 | Serial L01–L05 via the sole operator | UNVERIFIED; requires accepted entry evidence |
| 6 | Independent final review of completed live acceptance | Pending; code/package review already passed |

Completion depends on resolving disk capacity, then builds and live outcomes. No reliable finish time is available while storage is blocked. No merge, push or publication has occurred. Earlier sections labeled owner deferral describe historical scope and are superseded by the active resumption above.

## Earlier checkpoint: installed gates passed; legacy volume refused

Fresh integrated physical defaults passed1999/1999 with typecheck/build on both exact Nodes. Both clean npm/plugin37-command proofs and wrapped startup passed; Root audited all69 compiled payload files. [Distribution binding](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-repaired-distribution-binding.json).

The sole operator then ran the actual compatibility lookup exactly once at full HEAD e971d331, Source3edf247a. It returned HOST_PREREQUISITE_MISSING/exit3 without a guard mismatch: the older iOS_22G86 Profiles directory is uid0/gid80/0775 and the preserved strict legacy-volume rule rejects it. Cryptex discovery was not reached. Root audited2169 provenance checks over693 private files. [Refusal](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/operator-repaired-compatibility/refusal-report.md), [audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-repaired-compatibility-audit.json).

The same operator completed the [bounded two-volume manual diagnosis](legacy-volume-diagnosis.md) and returned idle. Two once serial diskutil queries reported exact MountPoint and typed Writable/WritableMedia/WritableVolume=false. Recorded legacy modes fit the proposed sets. Root audited4185 checks/27private files; three system executable-ancestor inode values remain qualified because their original integer precision is not recoverable. No compatibility lookup or runtime file conversion was repeated. [Native audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-legacy-volume-evidence-audit.json).

The owner separately approved the [final legacy v3 proposal](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/legacy-volume-policy-proposal-v3.md); [exact decision and frozen SHA](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/owner-legacy-mount-trust-decision.json). Both final proposal reviews PASS0findings. The isolated author is now implementing the [approved repair and verification order](legacy-volume-repair-plan.md), with genuine failing regressions and serial default gates before independent implementation review. Source is still the accepted3edf247a until a new frozen candidate passes those gates. Independent proposal reviews retained two Spec P2s in earlier revisions: stable enumeration/candidate binding and lossless identity handling; v3 requires both. Migration, app builds, devices, L01–L05 and ticket12 remain unstarted. The historical sections below retain their original checkpoint chronology.

## Latest result

Tickets 01 through 10 and H01 through H09 are accepted for the original product `b618116d3d72a9bbd6f9a9fdcc4da325bc9dc433`: actual default checks passed 1,675 tests, typecheck and build on Node 26.8.1 and exact Node 24.0.0. Clean npm/plugin proofs passed 37 commands per runtime. [Accepted host report](../observed-integration/acceptance/host/report.md).

The current prerequisite diagnosis is complete. Stable direct metadata confirms installed iOS 27.0/build `24A434` in the exact Cryptex bundle. All required Xcode identity and minimum-host fields match. The retained exact mount response reports `Writable`, `WritableMedia` and `WritableVolume` false; seven sampled BSD flags are zero. [Root phase5 audit](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-phase5-audit.json), [retained mount derivation](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/root-phase5-retained-mount-derivation.json).

The unchanged bridge refused `/Applications` mode0775 before reading runtime metadata. Its discovery also excludes the Cryptex path, and the stable 34,501-byte Xcode plist expands to 77,555 JSON bytes, beyond its 64KiB output limit. These findings supersede the earlier installation-only advice. Actual production compatibility remains UNVERIFIED.

## Earlier execution order

| Order | Work and owner | Completion evidence |
| --- | --- | --- |
| 1 | Complete: Root integrated the independently accepted Applications repair | Candidate `a0e68917` integrated as `c12ed4f6`; exact two-file overlay audited, preserved raw gates, Spec and Standards PASS. |
| 2 (complete) | Root integrated reviewed fixed Xcode output and bounded XML mount parser | Genuine failing regressions; fixed Xcode conversion128KiB combined output only, all inputs64KiB; parser64KiB/depth32/8192nodes, typed exact mount and three false writable fields. Both Nodes174focused/1819default/typecheck/build; both review axes PASS. Integrated5505f803; Root439Source/69compiled match. |
| 3 (complete) | Root integrated the independently reviewed bounded Cryptex implementation and fixture isolation | Candidate720cb380 integrated3edf247a, all441Source match,436 protected paths unchanged. Both author defaults1999/1999/typecheck/build; Spec and Standards PASS with0findings. Earlier failed default retained. |
| 4 (active) | Root revalidates the repaired product and installed distribution | Fresh physical default gates on both Node versions, typecheck/build, clean npm/plugin proofs, all69 compiled/install associations and wrapped startup. The reviewed author gates precede these integrated proofs. |
| 5 | Same sole operator completes operational entry | [Actual installed compatibility](installed-compatibility-recheck.md); private account config/default digest; reviewed migration; held capacity at most8; storage reservations; unchanged fixture and Weather builds in isolated DerivedData. |
| 6 | Same sole operator runs L01 through L05 serially | Fresh create-source iPhone17/iOS27.0 allocation per case, public cross-process interfaces, exact effects, visible outcomes, retained raw evidence and all five allocations. |
| 7 | Independent nonauthor gpt-6-astra high reviewer completes ticket12; Root reports readiness | All H/L rows and safety review PASS; bounded re-review after fixes. No automatic merge, push or release. |

## Approved trust boundaries and current work

The owner approved only canonical root0/admin80/exact0775 `/Applications` as an ancestor of fixed `/Applications/Xcode.app`, with strict checks below it. The focused candidate passed 78 tests on both Node versions and final actual default gates1723/1723 with typecheck/build. [Preserved candidate evidence](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/permission-candidate-evidence/root-preservation-index.json), [independent Spec](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/permission-candidate-review/spec/report.md), [Standards](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/permission-candidate-review/standards/report.md).

Earlier full26 permission-fixture failures were caused by child umask077, confirmed by controlled unchanged cases; private evidence stays077 and tests use normal child022. The first full24 run had three lock/milestone failures; those three unchanged cases and one identical full rerun passed. The lower cause of the first24 failure remains unconfirmed. All raw failures and their scope remain recorded.

The owner separately approved the [bounded Cryptex v3 policy](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/cryptex-policy-proposal.md). [Exact answer and frozen proposal hash](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/owner-cryptex-trust-decision.json). It trusts root/daemon namespace managers only in the stated fixed subtree and requires fresh exact unwritable mount evidence. This is a mode-based policy, without an inspected ACL inventory or atomic ancestor pin. Independent proposal review found no remaining scoped defect; implementation regressions and reviews are still required.

The accepted Xcode/parser repair includes one narrow existing fixture extension: its fake SourceProcess may accept128KiB only for the exact fixed Xcode Info conversion command. All other commands retain64KiB. No input-size heuristic or existing assertion relaxation is authorized.

## Operational entry

The owner confirmed older/external writers are stopped and no additional historical roots or exclusions are declared. The private strict [migration declaration](../observed-integration/acceptance/host/operational-confirmation-2026-10-09/declaration.json) is prepared and unexecuted. Preserve all default sources, claims and protected UUIDs. The reviewed command is `node dist/device/admission-maintenance.js migrate <private-declaration.json>`; only the sole operator may execute it after host gates and actual compatibility pass.

The owner-confirmed GPT-6.1-Sol xhigh operator remains in the same sibling pane, terminal `term_19640861-824c-4f24-8789-3f584723bc5a`. It is idle after phase5. Root coordinates, integrates and audits; Root never operates a device. [Binding](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/user-evidence-and-binding.json).

Before allocation, verify private effective config/store authority, default digest, capacity and conservative storage. Never clear an unknown-create guard or increase capacity to finish acceptance. Build unchanged apps with generic simulator destinations in isolated DerivedData; inspect bundle identity, platform, architecture, minimumOS and source/app hashes. Record host/Xcode/runtime/Node/vendor versions.

## Five serial live cases

| Case | Public sequence | Required action outcome |
| --- | --- | --- |
| L01 | CLI prepare → CLI action → MCP get | Fixture Home to Details; outcome_observed; attempted/acknowledged true;1touch,0relaunch,N≥2captures. |
| L02 | MCP prepare/start → CLI report | Home already satisfied; flagsfalse;0input,1capture. |
| L03 | CLI prepare → MCP start → CLI report | Absent Details precondition; PRECONDITION_NOT_MET; flagsfalse;0input,1capture; retain allocation. |
| L04 | Recording MCP harness prepare/start → fresh CLI retrieval/conflict and legacy successor | Withhold one successful real touch reply before acknowledgement; UI_ACTION_UNCONFIRMED, persisted attempted null/acknowledged null, quarantine; raw success retained; successors/retrieval/conflict0backend calls. Synthetic loss has only that scope. |
| L05 | MCP prepare → separate CLI action → MCP get | Unchanged Weather Settings sheet; outcome_observed;1touch,0relaunch,N≥2; snapshot and JPEG agree. |

Each preparation uses exactly one create, boot, install and launch, with fresh unique declared IDs. Count actual listing/readiness/action captures and all backend calls. Retain five devices, including refusal and quarantine, within eight held allocations. Stop on uncertainty, unknown creation, exhausted capacity or unexplained effects; no replay, replacement, erase, delete, shutdown or reset.

The Cryptex author now works in the isolated `fix-installed-cryptex-runtime` branch, base `38aa879c`, with436 other accepted paths protected after the narrow shared and public-child mapper isolation repairs. Only its focused regression/typecheck/build window is granted; full gates follow freeze. The sole operator remains idle.

All L01 through L05 remain UNVERIFIED. Ticket12 is not dispatched. No production config/store activation, migration, app build or live device action has occurred in this diagnosis. Runtime fallback, downloads, host permission changes, cleanup, merge, push and publication remain outside this execution.

The first frozen Cryptex default check failed on Node26 because a separate public child fixture mapper still exposed native namespace paths. Its original1985/1858pass/127fail result is retained; exact24 is held. Root authorized only that mapper, preserving its process guards/assertions. The production policy stays fixed; the five-file candidate needs new final checks, both defaults and bounded independent re-review.

## Cryptex successor accepted; physical gates running

Successor720cb380 passed both actual unmodified defaults1999/1999, focused505/505, coverage354/354, typecheck/build. The public fixture's14 pure cases have genuine11pass/3fail reds and14/14 greens on both Nodes. Production policy bytes and166 prior cases stayed unchanged. Independent Spec257checks and Standards207checks PASS with0findings; old SpecFAIL/default1985/1858/127 remains preserved.

Root preserved952 authored evidence files, rehashed172 sealed review outputs and integrated the exact five-file Source at3edf247ab44d3332bc4bab5f3a43104536d84ce9. All441 Source,436 protected baseline paths and15 original host hashes match. Physical integrated defaults are now running serially; fresh37-command clean npm/plugin proofs and complete69-file payload/startup correspondence follow. Compiled output cannot authorize entry until those gates finish.

The next operator stages are already prepared: [single actual compatibility lookup](installed-compatibility-recheck.md), then [private configuration, migration, capacity/storage and unchanged app builds](operational-entry-after-compatibility.md). Each requires Root's accepted exact preceding binding. The same sole operator stays idle. L01-L05 and ticket12 remain unstarted.
