# Stability

## What 1.x promises

These stay compatible for every 1.x release:

- **The script format,** `"version": 1`. A script that's valid in 1.0 stays valid.
- **The CLI and MCP tools:** command names, options, exit codes (0 passed, 1 failed, 2 inconclusive, 3 couldn't start, 130/143 signals), the tool names and inputs, and `start_scenario`'s `runId` and `watchUrl`.
- **What verdicts mean:**
  - the fixed 0.9 and 0.1 bounds;
  - a confidently false claim fails its checkpoint even beside uncertain claims;
  - each checkpoint is judged once;
  - passed, failed, and inconclusive mean what [reports and evidence](07-reports-and-evidence.md) says.
- **The vocabularies:** the [reason codes](reference/reason-codes.md) and the selector roles.
- **The evidence layout:**
  - the `.jev-runs/<run-id>/` location;
  - the file names `run.jsonl`, `report.json`, and `screen-N`;
  - the JSONL envelope and event type names;
  - the `verdict` event;
  - [`report.json`](reference/report-json.md).

**1.x may add:** optional script fields, step kinds, reason codes, `report.json` fields, event types, CLI options, and MCP reply fields. Tools that read these should ignore fields they don't know.

**Needs 2.0:** renaming or removing anything above, changing what a code or verdict means, changing the bounds, or rejecting a script that used to be valid.

**Not promised:** the prose report's wording, the watch page, the log pane's look, other event payloads, the lock file's location, and internal code.

## What 1.2 added

1.2 adds Android. Everything here is an addition: iOS scripts, reports, messages, and exit codes are unchanged, and there's nothing to change in an iOS script.

- **Script fields:** `"platform": "android"`, with `app.package`, `app.activity`, `app.intentExtras`, `device.serial`, and `device.avd`. A script without `platform` is an iOS script, read exactly as 1.1 read it. [Script format](reference/script-format.md).
- **Reason codes:** `DEVICE_NOT_CONNECTED`, `DEVICE_AMBIGUOUS`, `DEVICE_UNAUTHORIZED`, `DEVICE_NOT_BOOTED`, `DEVICE_LOCKED`, `APP_NOT_INSTALLED`, `APP_NOT_RESPONDING`, `DEVICE_UNSUPPORTED`, and `ANDROID_TOOLS_UNAVAILABLE`. They're part of the frozen list from now on. [Reason codes](reference/reason-codes.md).
- **`report.json` fields,** on Android runs only: `platform`, `package`, `activity`, `intentExtras`, and `typedFields`. [Field reference](reference/report-json.md).
- **Event fields,** on Android runs only: `started` records the app's identity and launch options; `prepared` records the device identity, the serial, the device agent's SHA-256, and `sweptLeftovers`; `action` records `shownValue`; and `step` records `settled: false` for a screen still changing.
- **The `capture` command.** Its stable parts:
  - its options: `--serial`, `--avd`, and `--jev`;
  - its exit codes: 0 when it printed, 3 when it couldn't capture, and 130/143 for signals;
  - the named fields of its element lines: `role`, `label`, `value`, `identifier`, `placeholder`, `state`, and `selectable`.

  Element lines may gain fields, so ignore ones you don't know. `--jev` prints Jev's text for the screen, in the pinned Android observation shape (below).
- **The `/test-android` skill,** and the plugin's optional **Android device** setting. The simulator setting is now optional too.

## Pinned dependencies

- **MobileBuildMCP** stays pinned (2.7.1 in 1.0). A newer version is adopted only after the contract tests pass and the benchmark scripts keep their verdicts. It then ships as a minor release.
- **mobilecli** stays pinned (1.0.14 in 1.2), and so does the SHA-256 of the device agent copied out of it. A newer version is adopted only after its agent passes the contract tests and the Android release scripts keep their verdicts. It then ships as a minor release.
- **The Jev model** stays pinned (`jev-1.13.0`). A new model, or any change to the screen text sent to Jev, must first pass the frozen assertion test: no confidently wrong answer, and at most 3 of 48 uncertain. It then ships as a minor release, named in the release notes and in every report. 1.0 sends observation shape `visible-full-text-v2`: the v1 text plus scroll-bar lines, adopted after that test. Android runs send `android-full-text-v1`. A change to it re-runs Android's 10-screen check, which must give no confidently wrong answer.

## Upgrading from 0.1.0

1. **Add `"version": 1`** to every script. Scripts without it are rejected with a message saying so.
2. **Remove `value: ""` selectors.** They never matched a real empty field, and are now rejected.
3. **Use a role from the list** ([make elements selectable](03-identifiers.md)). Other roles are rejected.
4. **Exit codes:** "couldn't start" is now `3`, not `2`, and `report` now returns the run's code instead of 0.
5. **A false claim beside an uncertain one now fails the checkpoint.** In 0.1.0 it was inconclusive.
6. **The device layer is installed with the bridge,** so there's no `npx` download on first run.
7. **New:** `report.json`, `run --json`, `app.launchArgs`, the log pane and `logs`, and the `APP_EXITED` reason.
