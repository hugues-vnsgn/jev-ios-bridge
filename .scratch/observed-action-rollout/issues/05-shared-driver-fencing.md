# 05 — Enforce admission at every updated iOS driver dispatch

Type: task
Status: ready-for-agent
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

### Root integration guidance — 2026-10-08

Read-only driver preparation identified a distinction needed to preserve existing behavior. A backend `DeviceCliError` with validated `terminalAcknowledged` may be returned as a typed internal response envelope from the existing `AdmittedSession.dispatch<T>` callback, allowing confirmed command settlement before the driver throws the semantic error to its legacy retry caller. Transport loss, malformed/missing terminal payload and unknown outcome must reject inside dispatch and revoke issuance. This does not authorize native-release claims. No new generic store release API is needed.

`tapOnce` authorizes operation kind `tap`, activating the core's durable single-tap guard. Ordinary legacy `act` uses a distinct driver-owned kind because scripted runs can legitimately contain multiple taps and the existing bounded stale-reference retry. No public caller supplies raw kinds/tokens; observed input has no refresh/retry/fallback.

Keep production admission opening lazy for iOS effectful paths. Android-only factory construction and key-free adapter startup must not acquire a production store or require migration merely because mobileBuildMcp options are present. Ticket03 supplies typed park/consume ownership transfer; do not emulate it by reacquiring or relaunching.

Read-only coverage map at `8e5b182`: most commands use `index.ts:519`, but window opening (`571`), selected-device listing (`615`) and app stop (`854`) bypass it; launch-error diagnostic listing (`596`) must also stop after uncertainty. `close`/`releaseLate` at831–859 currently schedules late device cleanup. Existing tests asserting cancellation followed by stop/unlock, late cleanup/retry or iOS dead-PID reclaim must change to the accepted fencing behavior; this is an intentional behavior correction, not permission to weaken test assertions. Preserve the ordinary acknowledged stale-reference retry tests. A parked driver attaches device/app context without launch, boot, install or window opening.

Test backend isolation includes an injected window opener: a fake command runner alone must not let a test store reach the real opener. Config selection, local log-tail reads and process-liveness inspection are local operations, not selected-device dispatches.
