# Phase 3: Android fields in the run log and report.json

Status: ready-for-agent
Blocked by: 03, 05

Spec: [../spec.md](../spec.md), "Phase 3". The work is [the release spec's phase 3](../../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9) item 5, with its part of item 8, and [open points 5 and 11](../../android-support/release-spec.md#open-points-for-the-executor) (owner decisions C, D and G). Read them in full. The detail below only adds acceptance criteria.

## What to build

1. **`started`**: records the platform's projection rule (`android-full-text-v1` from Issue 05 on Android runs), and the run-log allowlist in `src/log/index.ts` accepts both rule names. On Android runs only, it also records `platform: "android"`, `package`, `activity` (or `null`) and `intentExtras` (`{}` when none). `bundleId` is `null` on Android runs.
1a. **The run renders Jev's view for the script's platform.** `runScriptedScenario` passes the script's platform to `renderAssertionState`, so an Android run shows Jev `Current Android screen (full accessibility capture):` and the `android-full-text-v1` projection (Issue 05), and the rule recorded in `started` matches what Jev saw. An iOS run's calls stay as they are, byte for byte.

   2026-09-30, orchestrator note: no Issue covered this wiring. Issue 05 built the Android branch of the renderer, and this Issue records its rule, so the wiring belongs here.
2. **`prepared`**, on Android runs only: the device identity, the serial, the device agent's SHA-256, and `sweptLeftovers: true` after a crash takeover. The driver supplies them; add the smallest optional hook on `DeviceDriver` for it, which the iOS driver doesn't implement.
3. **The shown value and an unsettled screen** (open point 11): the `action` event records `shownValue` and the `step` event records `settled: false` when the settle cap was hit, both through the run log's redactor as usual. The driver supplies them through an optional contract the iOS driver doesn't use.
4. **`report.json`**, on Android runs only: `platform`, `package`, `activity`, `intentExtras`, and an optional `typedFields` array, one `{ "stepId", "shownValue" }` per replace-text step, built from the events. The `prepared` fields stay out of `report.json`.
5. **The prose report** (`src/scripted/report.ts`) names the device identity, serial, agent SHA-256 and `sweptLeftovers` from `prepared`, and shows each shown value and "screen still changing" (decision I), on Android runs only.
6. **Golden** (item 8): `report-json.json` gains an Android run, built with a fake driver, and its three iOS runs stay byte-identical.

## Acceptance

- iOS `report.json`, `started`, `prepared`, `action` and `step` events, the prose report for iOS runs, and `evidence-layout.json`'s `startedFields` stay byte-identical.
- Redaction tests: `shownValue` goes through the run log's redactor like any other string, so a shown value holding one of the script's values appears as `[REDACTED]` in `run.jsonl`, and `report.json` and the prose report show only what the run log holds.
- No existing test changes; no existing golden entry changes.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments
