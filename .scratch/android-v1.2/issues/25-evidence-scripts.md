# Phase 7: the Android evidence scripts

Status: closed
Blocked by: none (phase 6 merged in)
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

## Comments

### 2026-09-30, coordinator: built

**Scripts:**
- `examples/diagnostic-app-android/scenario.json` (twin-fail);
- in `spikes/benchmarks/scenarios/`: `android-twin-pass.json`, `android-twin-ambiguous.json`, `android-cmp-number-input.json`, `android-settings-search.json`, `android-settings-search-vi.json` and `android-settings-list-swipe.json`.

All are `"version": 1`, `"platform": "android"`, and name no device. `tests/android-evidence-scripts.test.ts` parses each one. The live captures they were written from are in `spikes/benchmarks/results/v1.2.0/script-captures/api36/` and `api31/`.

**Found on the way: Issue 27.** The first live `capture` failed with `EXECUTION_ERROR`: the production clock gave `AbortSignal.timeout` a fractional delay. Every real Android run would have failed the same way. The fix is merged into phases 5 to 7.

**Deviations from phase 8's table, for the owner:**
- **cmp-list-swipe is replaced by `android-settings-list-swipe.json`.** cmp's million-row `LazyColumn` exists only inside a modal that its perf harness opens and closes by itself (`ModalPerfScreen.kt`), so it can't be swiped reliably, and cmp's source may not be edited. The substitute swipes Settings' main RecyclerView (classic Views) and claims a later row. A Compose-list swipe stays covered only by the unit tests' `api36-lists-scrollable.json` fixture. **Owner decision:** accept this, or add a stable list screen to the twin app.
- **cmp-number-input doesn't type into the empty placeholder field.** cmp's only empty field (de-DE, built-in keypad) takes input only from cmp's own keypad, which opens over the field, not from the system keyboard. The script replaces the vi-VN field's text instead (shown value `3.500.000`) and claims the formatted value. Typing into an empty field with a hint is covered by the Settings search field, which starts empty with the placeholder "Search settings".
- **The Settings search box is the typing check.** This emulator's Settings search returns no results, on both API levels. So the scripts check the typed text with a guard on the field's value, then open Display from the main list.
- **`android-settings-search-vi.json` is written for Android 12's Settings** ("Search settings", "Display"), because check 4 runs it only there. `android-settings-search.json` is for Android 16 ("Search Settings", "Display & touch").

**Dry runs** were made on the phase 7 branch before its whole-branch review, so they aren't the formal phase 8 checks. The evidence is in `$TMPDIR/jev-dryruns`, which isn't kept. Every script gave its expected verdict:

| Script | Emulator | Verdict | Detail |
|---|---|---|---|
| twin-fail | API 36 | **failed** | `Total: $5` scored 0.020 |
| twin-fail | API 31 | **failed** | `Total: $5` scored 0.020 |
| twin-pass | API 36 | **passed** | 0.99 and 0.98 |
| twin-ambiguous | API 36 | **inconclusive** | `GUARD_AMBIGUOUS` |
| cmp-number-input | API 36 | **passed** | 0.99, after one script fix (above) |
| cmp-number-input | API 31 | **passed** | 0.99 |
| settings-search | API 36 | **passed** | 0.97 |
| settings-list-swipe | API 36 | **passed** | 0.99 |
| settings-search-vi | API 31 | **passed** | 0.97, after one script fix (Android 12 labels) |

The cleanup gate was clean after every run.
