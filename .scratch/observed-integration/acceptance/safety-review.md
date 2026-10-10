# Independent observed workflow review — code/package scope

**PASS for the bounded code/package scope, qualified by `npm_config_maxsockets=1`.** The material Standards finding is closed; two P3 design advisories remain. **Full original SHIP/merge readiness is UNVERIFIED** because native, operational and live gates are deferred.

## Scope and pinned inputs

This is the owner-approved bounded code/package review. The owner deferred iOS 27 checks and approved continuing the code/package roadmap. Native compatibility, production-account configuration/activation, operational migration, app builds, device execution and L01–L05 remain **DEFERRED/UNVERIFIED**. Ticket 12's original `Status` and `Blocked by: 11` are unchanged. Full original SHIP/merge readiness remains **UNVERIFIED**.

The reviewer authored no implementation. Independent Standards and Spec children reviewed the same supplied diff; no further agents were used. This review executed only repository/evidence reads, hash audits and review-artifact writes. No tests, builds, downloads, dependency changes, native/account operations or secret access were performed by the reviewer.

- Planning base/tag: `b8c4a50942551bdf95d00036a6d2f7bb6142ff43` / `plan/observed-action-rollout-2026-10-08`.
- Initial reviewed integration: `a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a`.
- Tested product: `48d4b95e319a2c1b24480be6f008f208acf4327c`. Later `7216cd8d3ca888b7c159ab840a0b96fb69e4c960` and `a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a` preserve evidence only within the supplied product scope.
- Final reviewed integration: `a387e4926147e68a85f84c3142f14737bcd9b41f`.
- Documentation correction: `70169e87fa59113f1353c61fb90dfe1fc7bf5f2b`; ADR-0007 SHA256 `1ad352d842e153802d2c653b63a5dc4c607e84cadd5ee7fa54f0b4c3bb8c25eb`.

Exact initial diff:

```sh
git diff b8c4a50942551bdf95d00036a6d2f7bb6142ff43...a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a -- src tests scripts .github docs skills package.json package-lock.json README.md AGENTS.md GLOSSARY.md tsconfig.json tsconfig.build.json plugin CHANGELOG.md LICENSE
```

It is nonempty: 98 paths; SHA256 `8674aa75a9a1a97bf363b32faac5be1c6bab9dee6d2df0369a2f262b6a65f95e`. The [commit list](code-package-review/commits.txt) records `git log base..final --oneline`. Accepted contracts and policy decisions remain authoritative; [input-seal.json](code-package-review/input-seal.json) seals 44 named inputs at the initial revision.

## Standards

The [original independent report](code-package-review/standards.md) records three findings, kept separate from Spec:

- **P2, closed:** ADR-0007:24/27 promised nonfatal presentation and excluded it from the lease ledger, conflicting with `src/device/index.ts:815`/`:817`. Root's documentation-only correction now describes acknowledged-error continuation, conservative timeout/uncertainty fencing, shared admission and local ledger settlement. [Bounded follow-up](code-package-review/standards-adr-followup.md) closes both parts at `70169e87fa59113f1353c61fb90dfe1fc7bf5f2b`; production fencing and device permissions are unchanged.
- **P3, advisory:** `src/device/admission-migration.ts:28` and `src/device/admission-sqlite.ts:47` duplicate the four protected UUIDs. One immutable definition would keep migration and new-admission exclusions together. No current exclusion divergence was found.
- **P3, advisory:** `src/observed/schema.ts:48` and `src/observed/allocation-schema.ts:37` duplicate canonical JSON logic with different handling of undefined object fields. Share canonicalization while keeping request normalization separate. No digest/replay defect was demonstrated for validated inputs.

Standards conclusion after correction: **PASS with two nonblocking design advisories; no open material documented violation.** These are judgments under the supplied twelve-smell baseline, not tooling violations.

## Spec

The [independent Spec report](code-package-review/spec.md) records **zero confirmed defects** and no confirmed unrequested feature. Its low-priority advisory is that preparation/artifact bundle-ID validation is broader than action validation (`allocation-schema.ts:19`, `artifact.ts:173`, `schema.ts:12`); sharing the validator would refuse unusable identifiers earlier. The allocation contract does not explicitly impose the action regex, and no successful installation of such an artifact is claimed.

Recovery is qualified rather than repaired: `public-contract.md:97` says restart performs explicit recovery, while the accepted admission decision permits explicit startup/operator recovery, ticket 06 specifies separate recovery methods, and ticket 08 excludes implicit recovery. Production CLI/MCP construction does not invoke those internal methods. Reads remain non-mutating and abandoned authority remains unavailable. This review does not promise automatic installed-restart recovery or introduce a new public operation.

Spec conclusion: **PASS for the bounded code/package scope.** Live requirements are unverified, not waived from the original rollout contract.

## Safety and module assessment

No additional material safety defect was found in the inspected changes.

- **One authority and conservative migration:** `Admission.open` fixes the per-user root; real drivers reject test stores. `admission-sqlite.ts:104–229` validates migration guard, marker/schema/root identity, private files/sidecars, DELETE journal mode and short transactions. Migration checks declarations and source separation, reads historical files through non-following descriptors, retains uncertainty/protected devices and refuses live/unsafe sources (`admission-migration.ts:73–263`). Isolated evidence does not prove operational quiescence or protect against arbitrary external writers.
- **Identity, capacity and creation:** reservation/consumption and creation receipts commit in the same authority (`admission-sqlite.ts:241–580`). Global action identity, immutable request/content binding, held capacity and durable unknown-creation guard precede effects. Ready consumption, supplied inventory and legacy acquisition consult the guard. Retained allocation identity prevents reuse even when host admission becomes available.
- **Dispatch, cancellation and parking:** claim-owned dispatch authorizes synchronously before invoking the backend (`admission.ts:167–184`); SQLite cancellation and command authorization share writer ordering (`admission-sqlite.ts:589–632`). The driver tracks underlying operations, closes issuance on uncertainty and does not treat an abort wrapper as settlement (`device/index.ts:615–654`). Parking requires settled stages and generation transfer; normal allocator close leaves ready stock parked (`admission-sqlite.ts:414–463`, `observed/allocation.ts:262–350`). Already authorized work may still act; this protocol does not provide a native fence.
- **Truthful result authority:** tap authorization persists null attempted/acknowledged flags before receipt, late records cannot promote terminal authority, and terminal/disposition/allocation commit together (`admission-sqlite.ts:619–676`). Runtime finalization has a separate 5000 ms local budget; exports are postcommit projections (`observed/service.ts:164–206`). The renderer validates durable bindings and preserves nulls (`observed/report.ts:25–96`). Candidate/export files cannot manufacture success.
- **Installed-runtime trust:** fixed Applications exception and separately approved Cryptex/legacy mount classes remain bounded. Stable enumeration, exact typed readonly proofs, lossless identity, per-invocation expectations, metadata byte comparison, fixed child argv/environment and finite budgets stay inside `allocation-config.ts:83–492`. Tracking composition forwards private expectations through the actual allocator seam (`allocation-config.ts:235–246`, `allocation.ts:178–180`). No ACL attestation, atomic privileged-ancestor pinning or actual iOS compatibility is inferred.

The module structure concentrates authority in Admission/SQLite, lifecycle in the shared service, and preparation in the allocator. CLI/MCP delegate to those interfaces. The private process-composition seam now preserves identity without exposing trust overrides. The two Standards duplication advisories are concrete opportunities to improve locality; this review does not recommend a broad redesign.

## Evidence audit

Let **P** be [host/runtime-visibility-2026-10-09](host/runtime-visibility-2026-10-09/). The starting [Root audit](host/runtime-visibility-2026-10-09/root-tracked-final-gates/root-audit.json) hashes to `9f12730b699705b15e10bb924d6b1bff4a098eb390112fe6cdb5ea7a881dfcdd`.

Independent [evidence-audit.json](code-package-review/evidence-audit.json), produced by [audit-evidence.py](code-package-review/audit-evidence.py), verifies:

- All 443 initial source files and 15 original host artifacts; all 25,201 copied regular artifacts.
- Each Node's 26,034 private proof files and 14 recorded symlink targets, without following links: 52,068 files / 28 links total.
- Four payloads of 69 compiled files per Node, both preserved 69-file build snapshots and all four package/plugin archives.
- Exactly the three declared fixture differences from frozen author `cc5d30e2fdaf065bec476a65df465dabb1569f2c`; production source is exact. Existing legacy goldens and Android production have no base-to-initial changes; package/dependency files remain unchanged.

The private dependency trees and registry content remain in Root's supplied host vault. This reviewer hashed their regular files read-only; they are not claimed to be committed. The tracked copies preserve raw logs, controls, snapshots, archives and isolated fault traces.

Both final raw `npm run check` logs show typecheck, 2258/2258 tests and build, with 0 failures/cancellations/skips/TODOs. Receipts record exit 0, exact Node 26.8.1 / 24.0.0, serial execution and unchanged source. Node 26 raw SHA is `a363fe18ef02e6a217c138974f36ff0c1ce2f327c6351894ddc6a6ba8b938f2e`; Node 24 is `3d2dff936c469ffdcd7d7c2e0fc1d6dced05f0b9d7aaec54b840edd51ac2161c`. Exact paths and all 74 distribution command/raw pairs are in the independent audit.

Both fresh distribution proofs contain 37 commands, two installations, plugin build, seven CLI operations per installation, three MCP flag modes and 34 invalid MCP calls. Expected refusals exit 3; build/install/server commands exit 0. Raw install stdout records 157 packages in 50 s / 38 s. Blank npm configs, minimal environment and supported `npm_config_maxsockets=1` qualify this PASS. The helper's 90 s child bound, 45 s fetch timeout / retries 0, registry/TLS/integrity and assertions remain intact. Earlier default-concurrency stalls remain unresolved. Candidate-only installed and single-socket diagnostic packets were inspected as provenance; they do not replace these fresh integrated gates.

Both guarded installed startup supplements show two CLI reads/three MCP calls returning safe `STORE_UNAVAILABLE`; the guard records one `Admission.open` per CLI and one in the MCP composition, with zero other SDK/driver/child/account effects. The injection occurs before account access. It proves production factory error translation, not actual account corruption.

[host-map-audit.json](code-package-review/host-map-audit.json) verifies current source hashes for all source-backed case entries in the nine original host manifests. Original [host acceptance](host/report.md), [corrected completeness review](host/faults/review/host-completeness/round2/review.md), supplements and original raw-correspondence review retain their scope: 396 inventory IDs share 193 executions per runtime; 386 artifact groups and 26 supplemental source anchors / 302 assertion annotations / 70 titles are not extra unique executions. This review relies on that prior complete case association and independently binds current source, final logs and preserved traces; it does not claim a new per-variant run.

The three-file fixture repair is acceptable within its exact scope. The private marker publishes atomically after report inspection begins, with production handlers already installed; child output parses on `close`. The unchanged 6500 ms assertion now measures from the existing `beginActionFinalization` beforeCommit milestone. This excludes earlier synchronous transaction work and proves the local-close/finalization interval, not universal action wall time. Production 5000 ms and all outcome/effect/cancellation assertions remain unchanged. [Fixture input audit](code-package-review/fixture-input-audit.json) verifies all 17 referenced inputs. Original 2256/2258 failure, unchanged 2/2 diagnostic and intermediate 4/4 pass were read; 4/4 predates final atomic-marker bytes. Final 2258 gates validate final bytes. Historical 4fa Node 24 and other failure causes remain unresolved.

## Final documentation correction and delta seal

The [final delta audit](code-package-review/final-delta-audit.json) binds final integration `a387e4926147e68a85f84c3142f14737bcd9b41f`. Root's [correction audit](host/runtime-visibility-2026-10-09/root-adr-review-correction/root-audit.json) SHA256 is `23788f5e88242d5ef6c6d333f4edef8a6be3c4705c96c793cfc07b0bf8f67458`. All four actual raw logs were read and rehashed. Each Node passed 34/34 documentation/packaging unit cases and 31/31 existing fake Simulator-window cases, exit 0 and zero failures/skips; each receipt's complete source-before/source-after maps agree with the final 443-source manifest. These are affected checks, not new clean installations or native tests.

The initial-to-final product delta is only ADR-0007. All production/shipped/package inputs and 69 compiled hashes remain identical to the fully checked/installed product; all 15 original host artifacts match. Relative to frozen author cc5, 439 of 443 files match, with exactly four declared exceptions: the three fixture files plus ADR-0007; 435 protected paths remain. Final base-to-product diff SHA256 is `717e6b8684b2f3f584406030035e79376e80cb9b71c6f6070e73ea5cc0975850`. Full 2258/37/startup gates were not repeated after this documentation-only correction, and their earlier exact source association is preserved.

## Gate matrix

PASS below means the declared host scope and audited overlays only.

| Gate | Verdict | Evidence and qualification |
| --- | --- | --- |
| H01 | PASS | schema.json; strict schema/size/identity errors and no reservation/effects; final full logs. |
| H02 | PASS | schema.json; seven CLI/MCP operations, envelopes/exits/flags; fresh installed raw receipts and guarded startup. |
| H03 | PASS | identity.json; concurrent IDs, aliases, global binding, parked separate-process transfer; immutable reads. |
| H04 | PASS | identity.json plus runtime policy overlays; creation guard, capacity, supplied availability, staging/compatibility host faults. Native compatibility remains unverified. |
| H05 | PASS | cancel.json; durable ordering, signals, local close, parked readiness/TTL; final fixture timing qualification above. |
| H06 | PASS | crash.json; actual isolated owner-process kills, null flags, lost/ambiguous commit, late-owner refusal. No native transport-loss claim. |
| H07 | PASS | storage.json; isolated SQLite faults/export authority/read invariance; injected startup is a separate boundary proof. |
| H08 | PASS | migration.json; isolated historical imports, aliases/exclusions/source invariance. Production migration/quiescence unverified. |
| H09 | PASS, qualified | Exact 24.0.0 / 26.8.1 full checks and fresh 37-command npm/plugin proofs under maxsockets1; unchanged legacy/Android contracts. Remote CI execution unverified. |
| L01 | UNVERIFIED | Deferred CLI allocation/action and MCP retrieval on a real fresh simulator. |
| L02 | UNVERIFIED | Deferred real already-satisfied/no-input case. |
| L03 | UNVERIFIED | Deferred real failed-precondition/no-input case. |
| L04 | UNVERIFIED | Deferred real touch with synthetic reply withholding and successor refusal; no actual transport-loss proof. |
| L05 | UNVERIFIED | Deferred unchanged Weather visible sheet outcome and exact command counts. |

## Reproduction and recommendation

From the initial `a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a` snapshot, run `python3 .scratch/observed-integration/acceptance/code-package-review/audit-evidence.py` with this review's script and the supplied private host vault. It performs only hash/read checks. The root packet records the original serial executable commands and exits; this reviewer did not rerun them. Reproduce the ADR review with the exact initial-to-70169 three-dot diff for ADR-0007. The later documentation overlay must remain distinct from the initial 443-source seal.

Final bounded recommendation: **accept the completed code/package work with the maxsockets1 qualification and listed advisories**. No material safety or Spec defect remains open within this scope. **Full original SHIP/merge-ready: UNVERIFIED** until deferred native/operational/live requirements are completed. No merge, push, release or publication is authorized by this report.

Standards: three initial findings, P2 closed, two P3 advisories remain (worst open P3). Spec: zero confirmed findings, one advisory and one contract qualification.
