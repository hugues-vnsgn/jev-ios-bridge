# 05 — Enforce admission at every updated iOS driver dispatch

Type: task
Status: ready-for-agent
Execution: integrated
Claimed by: shared_driver
Mode: AFK
Blocked by: 03
Owner: Shared-driver implementer
Model: gpt-6.1-sol
Effort: high
Skills: cook, tdd, diagnosing-bugs, use-git-worktree
Expected commit: `feat: fence iOS driver commands with shared admission`

## Dispatch contract

Root supplies a full base SHA from the final pinned planning ref plus integrated dependencies, an isolated worktree/branch and this issue path. Follow [the implementation handoff](../../observed-integration/implementation-plan.md) for common protected files, context, ownership transfers and fixed-format response. Execution starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; the charting effort remains planning only. Stop and report a contract contradiction, unsupported operation, unsafe authority/replay, missing prerequisite or required protected-file edit; return bounded evidence, never substitute success.

## Context

[Admission](../../observed-integration/evidence/admission-decision.md): command ledger, compatibility lease, cancel/finalize. [Allocation](../../observed-integration/evidence/allocation-contract.md): preparation and parked driver transfer. [Seam](../../observed-integration/evidence/seam-decision.md): driver paths.

## Write ownership

Allowed writes: `src/device/index.ts`; `src/device/lease.ts`; `src/device/factory.ts`; `tests/device.test.ts`; `tests/device-lease.test.ts`; `tests/device-factory.test.ts`; `tests/lease.test.ts`; `tests/observed-touch-integration.test.ts`; `tests/admission-driver.test.ts`; this issue's Status and Comments only.

Root-authorized bounded fixture setup extension (2026-10-08): `tests/device-driven-actions.test.ts`; `tests/simulator-window.test.ts`; `tests/start-attach.test.ts`; `tests/scripted-run.test.ts`; `tests/observed-tap.test.ts`. Change only fake-runner fixture construction to inject an explicit isolated admission store/backend and, where needed, use a synthetic fixture UUID. Preserve behavioral assertions and existing goldens. A golden-bound identity conflict returns to Root; never weaken protected-device eligibility or silently infer test storage from `lockRoot`.

Protected shared files: `src/device/admission*.ts`; `src/experimental/**`; `src/observed/**`; `src/service.ts`; `src/cli.ts`; `src/mcp/**`; `src/device/android/**`, plus the common protected set in the handoff. Exactly one owner writes these allowed files; Root integrates and controls the next transfer.

## Bounded work

Install required integrated admission on legacy scripted/driven iOS, preparation/capture and observed paths before selected-device effects. Keep compatibility lease best-effort exclusion but disable iOS dead-holder reclaim. Add typed preparation operations boot/install/launch/readiness and a parked-action driver attachment with no relaunch. Persist dispatch authorization and ledger before every call; unify signal/deadline, track underlying promises, synchronously revoke issuance and reject late continuations/cleanup after uncertainty. Preserve ordinary legacy retry semantics while observed tapOnce remains one touch and no semantic fallback. Migration/root checks precede effects.

## Acceptance and stop criteria

H03/H04/H05/H06/H08 driver subsets: races against observed/preparation/legacy, guard blocks every new iOS path, cancelled/late operation sends no follow-up, parked attachment zero boot/install/launch, at most one observed input. Targeted driver/lease/factory/observed-touch tests and typecheck; Android regression tests remain passing.

Completion: Root integrates the real typed session interface before dispatching 06/07. Shared src/device/index.ts ownership ends here and transfers to Root; downstream workers cannot patch it. Return the handoff's fixed-format report with full commit/base SHA, files, commands/results, evidence, limitations and unresolved dependencies. A missing required assertion stays UNVERIFIED; a confirmed defect is BLOCKED until Root assigns its fix. No live operations, merge or publish belong to this ticket.

## Comments

### Root bounded capability follow-up — 2026-10-08

Ticket07 identified that `bootState` omits explicit vendor availability, leaving supplied-source eligibility unprovable before boot. Root owns a separate `feat/observed-inventory-status` worktree at `fd9b3c0d19284b9fc22c4bb5e3a3fd4bb0d3b181`, limited to `src/device/index.ts` and `tests/admission-driver.test.ts`. Add typed `inventoryStatus(signal,timeoutMs?)` for the admitted selected identity through the existing fenced vendor simulator listing. Validate state, UUID, unambiguous selected identity and boolean availability before settling successful or error receipts. Preserve legacy listing behavior. No real backend, device operation, extra direct command or source fallback belongs to this follow-up. Independent review and Node24/26 host checks precede integration; original ticket05 acceptance remains bounded to its recorded commits.

Follow-up accepted at `f6ab3304288f730d1dbb02c6185239b6a600c66c`: independent Spec/Standards PASS, final unchanged sequential full1208/1208 plus typecheck/build and exact24combined422/422, zero skips. Root integrated affected checks65/65 each runtime; checked hashes match. Original parallel SQLite contention failures remain preserved with isolated/sequential reruns and limits. [Review](../../observed-integration/acceptance/host/inventory-status-review.md). Ticket07 eligibility enforcement and full/live gates remain pending.

### Root acceptance: 2026-10-08

Integrated candidate `2ec78bd` and repair `6f0ad209` as `b3eb5ea`/`bd5d524`. Both independent review axes closed all findings. Root's integrated check passed1196/1196 plus typecheck/build; exact Node24.0.0 combined suites410/410, zero skips. The final checked blobs match the repair. [Review, original failures and integrated evidence](../../observed-integration/acceptance/host/shared-driver-review.md). Shared driver ownership now belongs to Root; tickets06/07 receive the accepted typed interfaces. Historical unintended baseline side effects remain UNVERIFIED, with no cleanup/probe used to resolve them.

### Root integration guidance — 2026-10-08

Read-only driver preparation identified a distinction needed to preserve existing behavior. A backend `DeviceCliError` with validated `terminalAcknowledged` may be returned as a typed internal response envelope from the existing `AdmittedSession.dispatch<T>` callback, allowing confirmed command settlement before the driver throws the semantic error to its legacy retry caller. Transport loss, malformed/missing terminal payload and unknown outcome must reject inside dispatch and revoke issuance. This does not authorize native-release claims. No new generic store release API is needed.

`tapOnce` authorizes operation kind `tap`, activating the core's durable single-tap guard. Ordinary legacy `act` uses a distinct driver-owned kind because scripted runs can legitimately contain multiple taps and the existing bounded stale-reference retry. No public caller supplies raw kinds/tokens; observed input has no refresh/retry/fallback.

Keep production admission opening lazy for iOS effectful paths. Android-only factory construction and key-free adapter startup must not acquire a production store or require migration merely because mobileBuildMcp options are present. Ticket03 supplies typed park/consume ownership transfer; do not emulate it by reacquiring or relaunching.

Read-only coverage map at `8e5b182`: most commands use `index.ts:519`, but window opening (`571`), selected-device listing (`615`) and app stop (`854`) bypass it; launch-error diagnostic listing (`596`) must also stop after uncertainty. `close`/`releaseLate` at831–859 currently schedules late device cleanup. Existing tests asserting cancellation followed by stop/unlock, late cleanup/retry or iOS dead-PID reclaim must change to the accepted fencing behavior; this is an intentional behavior correction, not permission to weaken test assertions. Preserve the ordinary acknowledged stale-reference retry tests. A parked driver attaches device/app context without launch, boot, install or window opening.

Test backend isolation includes an injected window opener: a fake command runner alone must not let a test store reach the real opener. Config selection, local log-tail reads and process-liveness inspection are local operations, not selected-device dispatches.

### Execution claim — 2026-10-08

Root dispatched implementation at `b70a7ab3883dfb1530918f16cc39324b1662f91e`; claimed by shared-driver implementer in the isolated `feat/observed-shared-driver` worktree. Reviewed plan and integrated ticket 03 interfaces accepted. Host-only fake effects and isolated durable stores; independent review supplied by Root.

Root approved a narrow simulator-window assertion extension: malformed selected-device list closes dispatch with zero launch; valid missing-identity listing retains warning behavior. Distinguish acknowledged settled opener failure from unresolved transport failure. Other extension files remain fixture setup only.

Fixture-only scripted vendor-error correction: the fake diagnostic `simulator list` now returns a valid empty simulator-list envelope; existing DEVICE_ERROR/vendor-code assertions are unchanged.

### Implementation handoff — 2026-10-08

Driver source complete from base `b70a7ab3883dfb1530918f16cc39324b1662f91e`; Root owns subsequent shared-driver edits after the focused commit. Host evidence is in `.scratch/observed-integration/acceptance/host/shared-driver/` (untracked). Focused checks: 201/201 on Node 26.8.1 and exact Node 24.0.0; full suite once: 1166/1166, zero skips; typecheck/build passed. Final boundary assertions added after the full suite were checked on both runtimes. Simplify was unavailable; inline maintainability review and Root's independent review cover the diff.

The initial ownership red harness accidentally invoked the original default backend on synthetic UUID `ABCDEF00-0000-4000-8000-000000000001` because the planned fakeBackend field was not yet implemented. Root was informed immediately. Original evidence remains unchanged; missing raw vendor output and side effects remain UNVERIFIED. Corrected baseline and subsequent host harnesses explicitly inject fake runner/window dependencies and isolated admission. No cleanup/investigation device operation followed the incident.


### Bounded independent-review repair — 2026-10-08

Root renewed ownership only for `src/device/index.ts`, `tests/admission-driver.test.ts`, `tests/simulator-window.test.ts` and these ticket comments at frozen parent `2ec78bdcc01a6f5a809022a921faf3fc2766e445`. Status remains ready-for-agent. No other source is changed.

R1: reproduced the existing separate-process transfer failure with explicit fake runner/window/store, then removed only the unused factory import inside the eval child. The module-level typed-factory import remains. Transfer passes on Node 26.8.1 and exact Node 24.0.0. The preserved original post-full patch shows that accidental child import entered after the original full-suite check; its historical green did not certify the final pinned test revision.

R2: malformed selected state and list-entry regression tests went red before strict identity/state validation was added inside terminal payload validation, before admitted dispatch settlement. Invalid/missing identity or state, invalid entry/list shape and malformed error receipts revoke issuance and send no window, launch, observe or stop follow-up. Valid empty/missing-selected lists still warn and acknowledged launch/cleanup remains supported; valid lowercase identity and ordinary retry assertions are preserved.

C1: real isolated preparation/observed claims with abort-ignoring fake operations demonstrated one remaining attach listener after uncertain close before the fix. A narrow local listener cleanup helper now covers park and failed/successful close independently of claim finalization. Red/green tests observe listener removal while the underlying backend remains pending, with unchanged retained lease after late settlement. This is bounded listener behavior evidence, not a process-wide leak certificate.

Corrective evidence is under `.scratch/observed-integration/acceptance/host/shared-driver/repair/`, private and untracked. Original reports, incident evidence and reviewer reproductions remain preserved. Fixed-candidate harnesses inject the existing runner/window options and explicit fakeBackend plus isolated store. Initial baseline backend incident side effects and missing raw vendor output remain UNVERIFIED; this repair performs no live/production/secret/cleanup/investigation operation. Root supplies independent repair review; Simplify remains unavailable.


Repair final gates on unchanged product/test blobs: focused eleven suites 220/220 on Node 26.8.1 and exact Node 24.0.0; final `npm run check` typecheck + full suite 1185/1185 + build, all exit 0 and zero skips. Coverage audit 220/220: index.ts 94.65% lines / 84.29% branches; factory.ts 100% / 81.82%; lease.ts 99.67% / 90.83%. Private corrective report and exact checked hashes are in the repair evidence directory. Source stops at the focused repair commit for Root's independent repair review and integration; no downstream worker may change the shared driver before that transfer.
