# Phase 3: fix whole-branch review findings

Status: claimed
Claimed by: implementer-08
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 3", and its Rulings. This fixes findings from the whole-branch review of `agent/android-v1.2-phase3` (Issues 03 to 07 merged, tip 497c6db). The work is on the feature branch itself.

## Findings

1. **Bug: the run log's redactor can erase `platform`, and the Android report fields vanish.** `src/scripted/run.ts` writes `platform: "android"` into `started`. `src/scripted/report-json.ts:70` and `src/scripted/report.ts:74` read it back to decide whether a run is Android. The allowlist in `src/log/index.ts:14-30` doesn't list `platform`, so a typed value that appears inside "android" (for example `"and"`, or even `"a"`) records `"platform":"[REDACTED]roid"`. That run's `report.json` then loses `platform`, `package`, `activity`, `intentExtras` and `typedFields`, and the prose report drops its Device line, typed fields and "screen still changing". Fix: allow the platform values (for example `protocolValues.platform = new Set(PLATFORMS)`), and add a collision test like the existing `projectionRule` one, covering `run.jsonl`, `report.json` and the prose report.
2. **One place decides the recorded platform.** `report.ts:74` and `report-json.ts:70` each re-check `started.platform`. Export one `recordedPlatform(events): Platform` (from `report-json.ts` or a small shared module), and use it in both.
3. **`isAndroidScenario` never reads the script** (`src/scripted/run.ts:52`). Delete it, and narrow with the union's discriminant, `script.platform === 'android'`. Keep the single `platform` variable for everything that isn't type narrowing. `platformOf` in `src/scripted/schema.ts:233` returns `Platform`.
4. **One helper for the act result.** `shownValueAfter` and `actOutcomeOf` (`run.ts:217-229`) split one job: `actOutcomeOf` only delegates, and `shownValueAfter` reads like a getter but sets `nextSnapshot` and adds to `verifyMs`. Merge them into one function whose name says it keeps the act result and returns the shown value, for example `keepActResult(result): string | undefined`.
5. **Android device errors go through the wrong error class.** Issue 04 added `DeviceReasonError` for bridge-owned codes. Issue 06's `selectAndroidDeviceId` raises `NO_DEVICE`/`INVALID_DEVICE` through `DeviceCliError` (`src/device/index.ts:285,287`), the MobileBuildMCP vendor error. Throw `DeviceReasonError` there, and have the CLI's pre-run check (`src/cli.ts:84`) print it for those two codes. The Android CLI stderr and exit codes that tests pin stay the same, and iOS is unchanged.
6. **Glossary.** `selectAndroidDeviceId` returns an unresolved serial or AVD name, which CONTEXT.md calls a "device name"; "device ID" is in its Avoid list. Rename it `selectAndroidDeviceName`.
7. **Comments.**
   - `src/scripted/vocabulary.ts:101-103` ends with `See ADR-0005 and "Reason codes" in the Android release spec.` Keep ADR-0005, and drop the spec pointer.
   - `src/device/factory.ts:12` says the Android driver "joins this same function later". Describe what the function does today.
8. **The schema repeats its own values.**
   - The error messages at `src/scripted/schema.ts:122,124` spell out the serial and AVD patterns by hand. Build them from `androidSerial.source` and `androidAvd.source`, as `src/device/index.ts` does. Every Android message pinned in `scripts.json` must stay byte-identical, so check that the built text equals today's.
   - `intentExtraValue` (`:69`) repeats `launchArgument` (`:65`). Build both from one helper that takes the message. iOS messages stay byte-identical.
9. **Say how typed values are counted.** Zod counts the 2,048-character limit on typed values in UTF-16 code units, so on Android an emoji uses two. Say so in `docs/guide/reference/script-format.md`, and keep the limit as it is.
10. **Shared test fixtures, for phase-3 tests only.** The temp folder plus `createRunLog` plus `finally rm` block appears at least three times in the phase-3 tests in `tests/scripted-run.test.ts`, and again in `tests/contract.test.ts`. A minimal Android script literal appears at least six times across the two files. Add `withRunLog(name, fn)` and `androidScript(overrides)` under `tests/fixtures/`, and use them in tests added during phase 3. Tests that existed at 819ea10 stay byte for byte, and their import lines too.

## Acceptance

- iOS scripts, messages, exit codes, the run log, `report.json`, the prose report, and MCP replies stay byte-identical to `main`.
- Every golden entry stays byte-identical. This Issue adds no golden entries.
- `git diff 819ea10 -- tests/` removes only the lines earlier rulings allow.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments

**2026-09-30, implementer-08:** All ten findings fixed on this branch, commits 1b69609..1751b3b (tip after this comment).

1. Redaction bug: `src/log/index.ts` now allows `PLATFORMS` for the `platform` field, so a typed value that collides with "android" no longer corrupts it. New collision test in `tests/scripted-run.test.ts` (red before the fix, green after) covers run.jsonl, report.json and the prose report.
2. `recordedPlatform(events)` exported from `src/scripted/report-json.ts`, used by both `report-json.ts` and `report.ts`.
3. `isAndroidScenario` deleted from `src/scripted/run.ts`; narrowed with `script.platform === 'android'` directly.
4. `actOutcomeOf`/`shownValueAfter` merged into one `keepActResult(result): string | undefined` in `src/scripted/run.ts`.
5. `selectAndroidDeviceId` (now `selectAndroidDeviceName`, see #6) raises `DeviceReasonError` for `NO_DEVICE`/`INVALID_DEVICE` instead of `DeviceCliError`; `src/cli.ts`'s pre-run catch prints it for those two codes. Android stderr/exit codes unchanged (contract tests still pass byte-for-byte).
6. Renamed `selectAndroidDeviceId` to `selectAndroidDeviceName` in `src/device/index.ts`, `src/cli.ts`, `tests/android-device.test.ts`.
7. Reworded the stale comments in `src/device/factory.ts:12` (describes today's refusal instead of promising future Android support) and `src/scripted/vocabulary.ts` (drops the unreachable "Android release spec" pointer, keeps ADR-0005).
8. `src/scripted/schema.ts`: `device.serial`/`device.avd` messages now built from `androidSerial.source`/`androidAvd.source` (byte-identical to the old hand-written text, verified against `tests/golden/scripts.json`); `launchArgument`/`intentExtraValue` now built from one `printableAsciiField(message)` helper.
9. `docs/guide/reference/script-format.md` now says the 2048-character typed-value limit counts UTF-16 code units; `tests/docs.test.ts` checks for that text. Limit itself unchanged.
10. Added `tests/fixtures/run-log.ts` (`withRunLog`) and `tests/fixtures/android-script.ts` (`androidScript`), and used them across the phase-3 tests in `tests/scripted-run.test.ts` and `tests/contract.test.ts` that repeated the temp-folder+createRunLog+cleanup block and the minimal Android script literal. Tests that existed at 819ea10 are untouched (verified by diff).

Gates at tip 1751b3b304022b1ee371bebe99397bcd8eb74628: `npm run check` passes (typecheck, 241 tests, build). No golden file changed since 4e7fba5. `git diff 819ea10 -- tests/` removes only lines already accounted for by prior Issues' rulings (logpane.test.ts, service.test.ts, golden/mcp.json, golden/vocabulary.json) plus lines this Issue's own phase-3-added tests introduced and then revised (scripted-run.test.ts, contract.test.ts, android-device.test.ts, docs.test.ts) — no line present at 819ea10 in those four files was touched.

**2026-09-30, implementer-08, review round 1 (commit 662cbae):** fixed the seven small points raised.

1. Reworded the platform-variable comment in `src/scripted/run.ts` to allow the one narrowing read of `script.platform`.
2. `platformOf` (`src/scripted/schema.ts`) now returns `Platform`.
3. Replaced the per-error-class `NO_DEVICE`/`INVALID_DEVICE` check in `src/cli.ts` with one `isDeviceSelectionError` predicate; stderr and exit codes unchanged.
4. Reworded `src/device/factory.ts:12` and `src/device/lease.ts:17` to describe what the code does today, no roadmap references.
5. `androidReportFields` (`src/scripted/report-json.ts`) now takes only `started`; `platform` is derived from it, and the redundant `!started` guard is gone.
6. `tests/fixtures/run-log.ts`: `withRunLog`'s callback no longer receives the redundant `runId`; call sites use the literal name. `tests/fixtures/android-script.ts`: `androidScript()` now defaults to a valid one-checkpoint script (not an empty, schema-invalid `steps: []`), and the `as ScriptedScenarioAndroid` cast is gone. Also applied `androidScript()` at `tests/contract.test.ts` (the `androidWithoutDevice` literal) and `tests/scripted-run.test.ts:780` (the `started` test's Android half).
7. `keepActResult` (`src/scripted/run.ts`) now evaluates `isActOutcome(result)` once.

Gates rerun at tip 662cbae7007cdcad4eec8bd22b4afe6d1a571fe8: `npm run check` passes (typecheck, 241 tests, build); worktree clean; no golden file changed; no line present at 819ea10 in the touched test files was touched.
