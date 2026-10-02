# Build spec: driven mode (v1.3.0, experimental)

Status: draft for the owner, 2026-10-01. Source of every decision: [the map](../map.md) (C1–C29, Q42–Q46, D0–D4, E1–E15) and tickets 01–09. Issues: [`issues/`](issues/).

## What we are building

A script can now contain **`do` steps**. For a `do` step the bridge doesn't follow a selector. It looks at the screen, lists the actions it could take, asks **Jev** which one performs the step, acts, and checks whether the step is done. When Jev isn't sure, the action is risky, the screen can't be read, or the run is stuck, the step goes **back to Claude**. The run pauses with the device still held, Claude answers through a new MCP tool, `resolve_step`, and Jev takes over again.

```
start_scenario(v2 script) ──► run loop (src/scripted/run.ts, unchanged for v1 steps)
                                 ├─ action / wait / checkpoint   as today
                                 └─ do ──► src/driven/step.ts
                                            observe → candidates → Jev decide → (search) → act → done?
                                            └─ needs Claude ──► handback gate ──► get_report: needs_claude
                                                                                resolve_step ◄── Claude
```

## Fixed rules (from the decisions)

- **Script version 2** (E1). Version 1 scripts parse, run, log and report **byte for byte as in 1.2** (ADR-0005; every existing test and golden file passes unchanged). Version 2 adds the `do` step, `"start": "restart" | "attach"` (E2), and `localOnly`. `values` entries may be literal or `{ "fromEnv": NAME }` in both versions (Issue 03).
- **`do` step:** `{ id, kind: "do", intent, doneWhen, effect: "none" | "test_write" | "destructive", values?: string[], localOnly?: boolean }`. `values` lists the value keys this step may type.
- **Jev's request** per decision (spike protocol, unchanged): one Choice over the candidates (`tap:<ref>`, `type:<ref>:<valueKey>`, `scroll:up`, `scroll:down`, `back`, `step_done`, `none_fits`) and one Noul "step done". State: goal (the script's optional `goal`, else the step intent), current step, done-when, plan values for this step (masked, see privacy), the last 2 actions, the screen text from `renderAssertionState`. The effect is never sent.
- **Acceptance:** confidence ≥ 0.80 (`none`) or ≥ 0.90 (`test_write`); `destructive` steps never; `step_done` only with the Noul ≥ 0.90; a pick on a risky-word control (E11: Delete, Remove, Erase, Reset, Sign out, Unsubscribe, Pay; case-insensitive, whole word, in the label, value or identifier) never. Constants live in one file.
- **Step completion:** a step is done when the "step done" Noul is ≥ 0.90 on a **fresh observation** taken after the last action (C4). Jev's choice alone never completes a step.
- **Target search** (E9): on `none_fits` or a below-threshold pick, if the screen has a scrollable element or no scroll was tried yet, scroll down up to 3 times then up up to 3 times, re-asking Jev after each; then hand back.
- **Stuck rules** (E10): unchanged screen after an action → one retry, then hand back; the same action 3 times in a step → hand back; A→B→A→B → hand back; at most **8 Jev decisions per step** → hand back. The run's `maxSteps` and wall time still apply; each Jev-driven action counts as a step toward `maxSteps`.
- **Hand-back** (E3–E5): the run pauses holding the lease. `get_report` returns at once with `state: "needs_claude"` and the package (reason code, step id and intent, screen text, screenshot path, Jev's top 3 picks with probabilities). `resolve_step({ runId, pauseId, answer })`, where `answer` is exactly one of `tap {ref}`, `tapAt {x, y}` (screenshot points), `type {ref, valueKey}`, `scroll {direction}`, `back`, `revise {steps}` (replaces the remaining steps; validated like a script), `stop`. A pause waits 5 minutes (`handbackTimeoutMs`, 1 s to 30 min); timeout → `INCONCLUSIVE` / `HANDBACK_TIMEOUT`, lease released. `stop` → `INCONCLUSIVE` / `STOPPED_BY_CLAUDE`.
- **Verdicts** (C22, C26): only a checkpoint can fail a run. A `do` step that can't finish ends `INCONCLUSIVE`. The bridge's verdict is the recorded one.
- **Who decided:** every action event gets `decidedBy: "script" | "jev" | "claude"`. v1 runs don't get the field (byte-identical).
- **Preflight** (E12): `.jev/preflight.json` in the project dir (`JEV_PROJECT_DIR`, else cwd): `{ "command": ["./scripts/is-test-env.sh"], "timeoutMs": 10000 }`, run once without a shell before the first `test_write` `do` step. Exit 0 → Jev may perform test writes; missing file, non-zero, timeout → every `test_write` step's actions go to Claude. Recorded in the run log (`preflight` event: ok / missing / failed, exit code, duration; never output).
- **Opt-in** (E13): a script with any `do` step is refused with `DRIVEN_NOT_ENABLED` before the device is touched unless both: `.jev/config.json` has `"drivenMode": true`, and the experimental switch is on (`JEV_EXPERIMENTAL_DRIVEN=1`, which the plugin sets from a new `experimentalDriven` user setting).
- **Local-only** (E14): a `localOnly` step's decisions all go to Claude; `.jev/config.json` `"localOnlyScreens": [{ "identifier"?: regex, "label"?: regex }]` — a screen with any matching element is never sent to Jev, its decisions go to Claude. Every typed value is replaced by `[value:<key>]` in Jev's state.
- **Device actions** (E6–E8): `Action` gains `{ kind: 'back' }`, `{ kind: 'scroll'; direction: 'up' | 'down' }`, `{ kind: 'tapAt'; x: number; y: number }` on both drivers. `tapAt` is reachable only through `resolve_step`.
- **Data:** screen text goes to TypeSafe at every Jev decision (disclosed in docs and skills, C18).

## New reason codes

`DRIVEN_NOT_ENABLED`, `HANDBACK_TIMEOUT`, `STOPPED_BY_CLAUDE`, `STEP_NOT_DONE` (a `do` step ended without its done evidence, e.g. Claude answered but the step still isn't done after the budget), `DEVICE_NOT_BOOTED` on iOS (Android already has it). Each with a vocabulary entry and a row in `docs/guide/reference/reason-codes.md`.

## Not in this build

Image input to Jev; physical iPhone (WDA); removing the experimental switch (the release gate decides, ticket 11); any change to v1 behaviour.

## Gates for every Issue

- `npm run check` passes (typecheck, all tests, build).
- Every existing test and every file in `tests/golden/` passes **unchanged**; new tests are added freely.
- No real device and no TypeSafe call in tests: fakes only. Live checks are the coordinator's, after merge (step 4).
- Never print, copy or commit the TypeSafe key.

## Issues and order

| # | Issue | Owns | Blocked by |
|---|---|---|---|
| 01 | [Device actions: back, scroll, tapAt](issues/01-device-actions.md) | `src/contracts/index.ts` (Action), `src/device/index.ts` (act), `src/device/android/driver.ts` (act) | — |
| 02 | [Show the simulator window; DEVICE_NOT_BOOTED on iOS](issues/02-simulator-window.md) | `src/device/index.ts` (prepare), `src/cli.ts` flag | 01 |
| 03 | [Typed values from environment variables](issues/03-values-from-env.md) | `src/scripted/schema.ts` (values), `src/service.ts` (resolve), `src/cli.ts` (pre-check) | — |
| 04 | [Candidate builder](issues/04-candidates.md) | `src/driven/candidates.ts` (new) | — |
| 05 | [Jev decision call and acceptance rules](issues/05-decide.md) | `src/driven/decide.ts`, `src/driven/policy.ts` (new) | 04 |
| 06 | [Script version 2 and the `do` step](issues/06-script-v2.md) | `src/scripted/schema.ts`, `src/scripted/contracts.ts`, `docs/guide/reference/script-format.md` | 03 |
| 07 | [The driven step loop](issues/07-driven-step.md) | `src/driven/step.ts` (new), one `do` branch in `src/scripted/run.ts`, reason codes | 01, 05, 06 |
| 08 | [Hand-back to Claude](issues/08-handback.md) | `src/service.ts` (pause state), `src/mcp/index.ts` (`resolve_step`), `src/driven/handback.ts` (new) | 07 |
| 09 | [Preflight, opt-in, local-only screens](issues/09-preflight-and-opt-in.md) | `src/driven/project.ts` (new), checks in `service.ts`/`step.ts`, plugin setting | 07 |
| 10 | [Report, watch page, skills, docs](issues/10-report-skills-docs.md) | `src/scripted/report*.ts`, `src/watch/index.ts`, `skills/*`, `docs/guide/*`, CHANGELOG | 08, 09 |
| 11 | [Start mode "attach"](issues/11-start-attach.md) (added during execution) | drivers' `prepare`, `PrepareScenarioContext`, the attach refusal in `run.ts` | 02, 07 |

Parallel waves: **01, 03, 04** → **02, 05, 06** → **07** → **08, 09** → **10**. After 10: whole-branch review (Codex), fixes, then the coordinator's live smoke runs (iOS simulator, Android emulator) and the PR to main.

## Rulings during execution

- 2026-10-01, coordinator: **`tests/golden/mcp.json` may change in Issue 06, additively only**: the published `start_scenario` schema widens to accept `"version": 2` scripts and `values` entries of `string | { "fromEnv": NAME }`. Nothing in it may be removed or narrowed, and every other golden stays unchanged. Reason: the spec requires the MCP schema to accept version 2, and ADR-0005 allows additive widening. (Issue 03 left it unchanged and flagged it.)

- 2026-10-01, coordinator, from Issue 06: a `"version": 2` script with no version 2 field keeps 1.2's rejection message (two v1 goldens pin it); documented, not changed. `"start": "attach"` (E2) had no owner: **Issue 11 added**, after 02 and 07.

- 2026-10-01, coordinator, from Issue 07: the spec's new reason codes go into `REASON_CODES`, so **`tests/golden/vocabulary.json` may change additively** (codes appended, nothing removed or reworded). `tests/script-v2.test.ts`'s "can't run do steps yet" test, which pinned a stop-gap this Issue removes, is replaced by one showing a `do` step runs.

- 2026-10-01, coordinator, from Issue 07: `resolve_step` gains a `done` answer (Claude declares the paused step done), so `localOnly` steps can finish. Issue 07's ten loop decisions (report in `.worktrees/handoffs/jev-drives/issue-07-report.md`) stand.

- 2026-10-01, coordinator, from Issue 11 (merged `a40a06c`): (a) the attach stop-gap test in `tests/script-v2.test.ts` was replaced by one showing attach runs (same kind of swap as Issue 07). (b) **Issue 10 adds reason codes `APP_NOT_IN_FOREGROUND` (Android) and `APP_NOT_RUNNING` (iOS) additively** to `REASON_CODES`/`vocabulary.json`/`reason-codes.md`, and switches the two attach refusals from `DEVICE_ERROR`+vendorCode to them. (c) iOS attach calls `xcrun simctl` and `log stream` directly, which ADR-0002 forbids: **pending the owner's ADR-0007 decision**; if refused, iOS attach becomes `UNSUPPORTED_ACTION`-style refused and Android keeps it.

- 2026-10-01, coordinator, from Issue 08 (merged `d9f40e6`): **time spent paused for Claude does not count toward `wallTimeMs`** (otherwise the default 5-minute wall time ends a paused run before the 5-minute `HANDBACK_TIMEOUT`). Issue 10 implements it in `src/scripted/run.ts` (pause the wall timer around the hand-back wait) and updates the `resolve_step` description that currently warns about it. `resolve_step` and `handbackTimeoutMs` are published only when the experimental switch is on (keeps v1 tool-list goldens). iOS `tapAt` is refused at answer time (`TAP_AT_PLATFORMS`), pending ADR-0007.

- 2026-10-02, coordinator, from Issue 10 (merged `4da7290`): `tests/start-attach.test.ts` — 3 assertions switched from `DEVICE_ERROR`/vendorCode to `APP_NOT_IN_FOREGROUND`/`APP_NOT_RUNNING`, as ruling (b) for Issue 11 requires. The stability page says driven parts may change before driven mode is declared stable: **owner to confirm**.

- 2026-10-02, coordinator, from the Codex whole-branch review (`.worktrees/handoffs/jev-drives/codex-review-report.md`, verdict not ready: 5 P1, 6 P2): fix Issues 12 (driven safety), 13 (privacy and pause), 14 (processes and iOS attach) added, all unblocked and parallel. **iOS attach is refused** (MobileBuildMCP can't tell the foreground app; the spec requires refusal) and its `xcrun simctl`/`log stream` calls are removed, so ADR-0007 is down to two exceptions. P2 #11 (simulator window changes v1 iOS runs) is an owner decision: it was requested (live-test issue 01, E15).

- 2026-10-02, coordinator, from Codex round 2 (`.worktrees/handoffs/jev-drives/codex-review-round2.md`, verdict merge after fixes: 9 of 10 findings fixed, no P1): fix Issue 15 for the three remaining P2s.

- 2026-10-02, coordinator, from Codex round 3 (`.worktrees/handoffs/jev-drives/codex-review-round3.md`: round-2 probes all fixed, one P2 left — marker-overlap leak): fix Issue 16 switches driven-mode masking to an unforgeable marker `⟦value:key⟧` and refuses values containing `⟦`/`⟧` in do scripts. v1 log-pane masking unchanged.

- 2026-10-02, coordinator, from Issue 16 (merged): its edits to 12 assertions in driven-only tests (old marker text, the replaced `[value:` rule) are accepted — they pin behaviour of this unreleased build; no v1 test or golden changed.
- 2026-10-02, coordinator, from the live checks (`.worktrees/handoffs/jev-drives/live-checks.md`): safety held on real devices, every check passed, but Jev decided 4 of 14 device actions; most hand-backs were right picks just under the floor. Raising the share is a ticket 10 decision with fresh evidence, not a post-hoc threshold change. Fix Issue 17 for the bugs found.

- 2026-10-02, coordinator, from Issue 17: test edits `1.2.0`→`1.3.0` (forced by the version bump) and the two driven report goldens accepted; the search memory is per screen, never run-wide.

- 2026-10-02, coordinator, from Codex round 4 (`codex-review-round4.md`: marker leak fixed; two P2 + one P3 in pause numbers and report completeness): fix Issue 18.
