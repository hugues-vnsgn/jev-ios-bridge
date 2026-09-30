# Phase 3: new reason codes, with iOS vendor codes kept

Status: closed
Closed: Merged into agent/android-v1.2-phase3 at 75c41fd
Claimed by: implementer-04
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 3". The work is [the release spec's phase 3](../../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9) item 3, with its parts of items 8 and 9, and [open point 3](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full. The detail below only adds acceptance criteria.

## What to build

1. **Nine new bridge reason codes** in `src/scripted/vocabulary.ts`: the seven from item 3's table (`DEVICE_NOT_CONNECTED`, `DEVICE_AMBIGUOUS`, `DEVICE_UNAUTHORIZED`, `DEVICE_NOT_BOOTED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`, `APP_NOT_RESPONDING`) and open point 3's two (`DEVICE_UNSUPPORTED`, `ANDROID_TOOLS_UNAVAILABLE`), with their meanings. They're appended to `vocabulary.json`'s `reasonCodes`; nothing else in that file changes.
2. **Reword** `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY`'s descriptions so they serve both platforms, with unchanged meaning (`DEVICE_BUSY`: in use by another run, or by another tool's UI-automation agent, a foreign agent). These descriptions are in no golden file. **User-visible iOS messages don't change**, including `DEVICE_BUSY`'s "is locked by" wording.
3. **Scope the vendor pass-through** in `failureOf` (`src/scripted/run.ts`): MobileBuildMCP errors pass through only the 1.1 bridge codes, frozen as a set in code; everything else is `DEVICE_ERROR` plus `vendorCode`. Give the Android driver its own path to raise the new codes (for example a separate error type that `failureOf` passes through for any bridge code), tested with a fake driver. Check each new name against MobileBuildMCP 2.7.1's codes (`node_modules/mobilebuildmcp`) and record which overlap in your report.
4. **Docs** (item 9): `docs/guide/reference/reason-codes.md` lists exactly the bridge-owned codes, as `tests/docs.test.ts` requires.

## Acceptance

- A test: an iOS vendor `APP_NOT_INSTALLED` from the MobileBuildMCP driver still reports `DEVICE_ERROR` with `vendorCode: "APP_NOT_INSTALLED"`.
- A test: an Android-path error with a new code reports that code.
- The `deviceError` golden run in `report-json.json` stays byte-identical; so does every other existing golden entry except the `reasonCodes` append.
- No existing test changes.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments

**implementer-04 (2026-09-29).**

- **MobileBuildMCP 2.7.1 overlap check.** Searched `node_modules/mobilebuildmcp/build` for each of the nine new names (`DEVICE_NOT_CONNECTED`, `DEVICE_AMBIGUOUS`, `DEVICE_UNAUTHORIZED`, `DEVICE_NOT_BOOTED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`, `APP_NOT_RESPONDING`, `DEVICE_UNSUPPORTED`, `ANDROID_TOOLS_UNAVAILABLE`) and the vendor's own `code:` literals (`ACTION_FAILED`, `TARGET_NOT_ACTIONABLE`, `SNAPSHOT_MISSING`, `SNAPSHOT_EXPIRED`, `TARGET_NOT_FOUND`, `ELEMENT_REF_NOT_FOUND`, `TARGET_AMBIGUOUS`, `WAIT_TIMEOUT`, `SNAPSHOT_PARSE_FAILED`, `SIMULATOR_RESOLUTION_FAILED`, and the daemon/CLI-only codes). **No overlap**: none of the nine new names match anything MobileBuildMCP 2.7.1 actually raises. (Note: `WAIT_TIMEOUT` and `TARGET_AMBIGUOUS` are pre-existing 1.1 bridge codes MobileBuildMCP also uses; unaffected by this Issue.)
- **Scoping mechanism.** Split `REASON_CODES` into a private `REASON_CODES_1_1` literal (the 49 codes shipped through 1.1) merged with the nine new entries. `MOBILEBUILDMCP_PASSTHROUGH_CODES` is `Object.keys(REASON_CODES_1_1)` frozen as a `Set`, so `failureOf`'s `DeviceCliError` branch checks membership in that frozen set rather than the live `REASON_CODES`. This is a local implementation choice (the "for example a separate error type" in item 3 covers the design intent; the exact split/naming isn't spec'd).
- **Android driver's own path.** Added `DeviceReasonError` (`src/device/index.ts`), a small error class carrying a `ReasonCode` directly; `failureOf` passes its code through unconditionally, no `vendorCode`. No Android driver exists yet (phase 4), so it's exercised only by a fake driver in `tests/scripted-run.test.ts` ("an Android-path error reports its own new reason code, with no vendorCode").
- Confirmed the existing `tests/contract.test.ts` "device-error" run (iOS vendor `APP_NOT_INSTALLED` via `DeviceCliError`) still reports `DEVICE_ERROR` + `vendorCode: "APP_NOT_INSTALLED"` after `APP_NOT_INSTALLED` became a bridge code, and that the `deviceError` golden entry in `report-json.json` stayed byte-identical — this is the scoping regression the Issue calls out.
- Rewording of `NO_DEVICE`/`INVALID_DEVICE`/`DEVICE_BUSY` only touches `REASON_CODES`' internal descriptions (used by `docs/guide/reference/reason-codes.md` and the docs test); confirmed the user-visible "is locked by" lease message (`src/device/lease.ts`) is untouched.

**implementer-04, review round 1 (2026-09-29).** Five findings fixed:

1. Added a named test in `tests/scripted-run.test.ts` ("a real MobileBuildMCP uiError APP_NOT_INSTALLED still reports DEVICE_ERROR with the vendor code") that drives a real `MobileBuildMcpDriver` through a `CliRunner` fake returning a `uiError` envelope with code `APP_NOT_INSTALLED`, through `runScriptedScenario`, and asserts the run reports `DEVICE_ERROR` with `vendorCode: "APP_NOT_INSTALLED"`. Confirmed it goes red (reports `APP_NOT_INSTALLED` instead) when the scoped pass-through is reverted to the unscoped `isReasonCode` check, and green again with the fix restored.
2. Restored the pre-existing `tests/scripted-run.test.ts` import line byte for byte; the new `DeviceReasonError` import (and the `MobileBuildMcpDriver`/`CliRunner` types finding 1 needed) now live on their own added line.
3. Fixed the `REASON_CODES_1_1` comment: only the set of keys is frozen, not the descriptions inside it (three of which this diff rewords).
4. Deduplicated the pass-through rationale into one comment, kept on `MOBILEBUILDMCP_PASSTHROUGH_CODES`; removed the em dash.
5. Reworded `ANDROID_TOOLS_UNAVAILABLE`'s meaning to say "the device agent copied out of it" instead of "its agent", matching the domain model's phrasing, in both `src/scripted/vocabulary.ts` and `docs/guide/reference/reason-codes.md`.
