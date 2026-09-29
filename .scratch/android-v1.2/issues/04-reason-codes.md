# Phase 3: new reason codes, with iOS vendor codes kept

Status: ready-for-agent
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
