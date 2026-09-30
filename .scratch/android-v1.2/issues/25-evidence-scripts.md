# Phase 7: the Android evidence scripts

Status: ready-for-agent
Blocked by: phase 6 merged into `agent/android-v1.2-phase7`
Owner: the coordinator (device work)

Spec: [../spec.md](../spec.md), "Phase 7". The work is [the release spec's phase 7](../../android-support/release-spec.md#phase-7-docs-version-and-changelog-assemble-the-v120-spec-guide-pages-the-answers-named-per-item) item 11, with open point 17, and the flows and expected verdicts in phase 8's table (checks 3 and 4).

## What to build

- **Twin-fail:** `examples/diagnostic-app-android/scenario.json`. Add Apple and Bread, complete, and claim `Total: $5`; the expected verdict is **failed**.
- **`spikes/benchmarks/scenarios/`:**
  - `android-twin-pass.json`;
  - `android-twin-ambiguous.json`;
  - `android-cmp-number-input.json`;
  - `android-cmp-list-swipe.json`;
  - `android-settings-search.json`;
  - `android-settings-search-vi.json` (typing `Tiếng Việt`, checked by a guard).
- **Every script:** `"version": 1` and `"platform": "android"`, naming no device.
- **Writing them:** from `jev-ios-bridge capture` output on `Medium_Phone_API_36.1` (and `jev-actions-api31` for the Android 12 runs), under the release spec's device rules. Save the captures under `spikes/benchmarks/results/v1.2.0/script-captures/`.
- **A test** parses every evidence script with `parseScriptedScenario`, and checks that none names a device.

## Acceptance

- Every script parses. The captures they were written from are saved.
- The cleanup gate is clean after the captures.
- `npm run check` passes.
