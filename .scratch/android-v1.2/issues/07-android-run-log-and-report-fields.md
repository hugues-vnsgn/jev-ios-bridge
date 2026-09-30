# Phase 3: Android fields in the run log and report.json

Status: claimed
Claimed by: implementer-07
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

- **2026-09-30, implementer-07 (blocked before writing code):** Item 1 requires the `started` event to record, on every Android run, the `android-full-text-v1` projection rule plus `platform`, `package`, `activity` and `intentExtras`. But `tests/scripted-run.test.ts`'s existing test `'the started event names an iOS app by bundle ID and records a null bundle ID on an Android run'` (added on Issue 03, commit `ede562f`) already pins an Android run's `started` event to exactly `['mode', 'bundleId', 'bridgeVersion', 'jevModel', 'projectionRule', 'plannedSteps']`, with `projectionRule` required to equal the iOS run's (`visible-full-text-v2`), via `assert.deepEqual({ ...android, bundleId: 'com.example.app' }, (({ launchArgs: _launchArgs, ...rest }) => rest)(ios))`. The test's own Android script already sets `activity` and `intentExtras`, so there is no way to satisfy item 1 without changing this pinned assertion's expected keys and its `projectionRule` value. This isn't a case of adding a new test: the same input's runtime output changes.

  This conflicts with two explicit rules: spec.md's phase-3 settled context ("Don't change an existing test's assertions. The only edits to existing test code allowed are: [three named edits, none of which is this test]") and this Issue's own acceptance line ("No existing test changes; no existing golden entry changes"). Neither rule carves out an exception for a prior Issue's test that a later Issue's contract addition is designed to supersede.

  Stopping here rather than choosing unilaterally, since this is an interface/behavior change the Issue authorizes (item 1, open point 5, decision C) that directly contradicts a different owner-set rule (the closed list of permitted test edits), and picking wrong would mean either silently violating "no existing test changes" or silently failing to build item 1 as specified.

  **Question:** may I add this test's Android-run assertions (the exact `started`-event key list and the `projectionRule` value check) as a fourth permitted edit to existing test code, updating them to the new Android contract (the 4 new fields, plus `android-full-text-v1`), since it is Issue 03's placeholder that Issue 07 is expressly tasked to extend?
  **Recommended answer:** yes, treat it as a fourth permitted edit, alongside the three already named in spec.md's phase-3 settled context; extend (don't drop) its existing iOS assertions, which need no change.

- **2026-09-30, orchestrator ruling:** "Existing tests" means the tests that existed before phase 3, at `819ea10`. Tests added during phase 3, such as Issue 03's `started` test, may change with the contract they pin. Extended that test's Android half to the full contract (`platform`, `package`, `activity`, `intentExtras`, `bundleId: null`, `android-full-text-v1`); its iOS half is untouched. Proceeded with the Issue on that basis.

- **2026-09-30, implementer-07 (done):** Built items 1, 1a, 2-6 test-first in `tests/scripted-run.test.ts` and `tests/contract.test.ts`, plus one more test-only commit (default `typedFields` omission). One further deviation, beyond the ruled-on test edit above:

  **Golden file for item 6.** `report-json.json`'s existing "report.json shape for passed, failed, and device-error runs" test predates phase 3 (present at `819ea10`), so it's frozen, not covered by the ruling above. Its `golden('report-json', reports)` call does a full-object `deepEqual` against the file, so a fourth ("android") entry in that same file would make the frozen test's 3-key `reports` object mismatch the file forever, for every future run, not just at build time. Rather than touch that frozen test, I gave the Android run its own golden file, `tests/golden/report-json-android.json`, built the same way (a fake driver through `BridgeService`, `stable()`-normalized) — the settled-context fallback spec.md itself names ("add a new golden file only where none does"). The three iOS `report-json.json` entries are untouched (confirmed: `git diff 819ea10 -- tests/golden/report-json.json` shows nothing to change; the new golden test is fully additive).

  **Local choices** (none conflicts with an Answer; noted per the open points' instruction to report defaults used): `DeviceDriver.androidPreparation?()` as the prepared-fields hook (open point/item 2); `Snapshot.shownValue?`/`Snapshot.settled?` as the optional carrier for the action/step fields (item 3) — Snapshot already carries other driver-supplied, iOS-unused optional fields (`reusedFromAction`, `screenshotAgreement`, etc.), so this follows the existing pattern; `prepared` field names `deviceIdentity`, `serial`, `agentSha256`, `sweptLeftovers` (the release spec names the concepts, not the JSON keys); `report.json`'s `typedFields` key is present only when at least one replace-text step ran (omitted, not `[]`, otherwise), by analogy with how other optional report fields are omitted rather than defaulted.

  All gates green at the branch tip; see the implementer report for the exact command and log path.
