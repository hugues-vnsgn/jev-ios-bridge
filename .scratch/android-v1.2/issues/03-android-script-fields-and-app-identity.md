# Phase 3: Android script fields and the app's identity

Status: claimed
Claimed by: implementer-03
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 3". The work is [the release spec's phase 3](../../android-support/release-spec.md#phase-3-contract-additions-how-a-script-names-an-android-app-and-device-what-jev-sees-on-android-decisions-1-to-2-actions-across-android-versions-items-2-to-4-log-pane-and-app-exit-detection-item-6-where-android-plugs-into-the-code-items-4-8-and-9) item 1, with its parts of items 8 and 9. Read item 1 in full, and the ticket it cites, [How a script names an Android app and device](../../android-support/issues/03-script-and-device-identity.md). The detail below only adds acceptance criteria.

## What to build

1. **Script fields** (`src/scripted/schema.ts`, `src/scripted/contracts.ts`), exactly as item 1 lists: the optional top-level `platform`; for Android, `app.package` (required), `app.activity`, `app.intentExtras`, and `device.serial` or `device.avd` (at most one, with open point 20's patterns: serial `^[A-Za-z0-9._:-]{1,100}$`, AVD `^[A-Za-z0-9._-]{1,100}$`); the rejected fields (`app.bundleId`, `app.launchArgs` with a message pointing to `app.intentExtras`, `device.udid`); Android typed values under open point 2 (any Unicode text except control characters, a leading `-` allowed, the same size limits). An iOS script (no `platform`, or `"ios"`) that uses an Android field is rejected.
2. **The schema's shape** as item 1 says: one object schema, `app.bundleId` optional in the object, the ASCII pattern off `values`, the new fields optional, and a platform-aware refinement that emits today's iOS messages at today's paths. The `mcp.json` diff is exactly the one item 1 lists (owner decision A), and nothing else in that file moves.
3. **The app's identity in code** (moved from phase 2 item 6): reshape `ScenarioContext.app` once, as an iOS or Android identity (bundle ID and launch arguments, or package, activity and intent extras). Existing tests that build `app: { bundleId }` keep compiling unchanged. `startLogStream` takes the app's identity (`app`) instead of `bundleId`; per the owner's ruling, the two calls in `tests/logpane.test.ts` (lines 45 and 70) change to `app: { bundleId: 'com.example.app' }`, and that's the only change to that file. `BridgeService` and the MobileBuildMCP driver read the iOS identity from the reshaped type. The script field, `run.jsonl` and `report.json` keep `bundleId`, byte for byte.
4. **Golden entries** (item 8): accepted and rejected Android scripts in `scripts.json` with exact messages and paths, covering every rejected-field case in item 1, both device-name patterns, the serial-and-AVD conflict, and an iOS script that uses an Android field; the `mcp.json` input-schema diff.
5. **Docs** (item 9): `docs/guide/reference/script-format.md` documents the new fields, enough for `tests/docs.test.ts`. The full docs come in phase 7.

## Acceptance

- Every existing `scripts.json` entry gives the same message at the same path. If one moves, fix the schema, not the golden file.
- `mcp.json` changes only as item 1 describes.
- No existing test changes except the two `tests/logpane.test.ts` calls.
- `npm run check` passes.
- No device, simulator or emulator is touched.

## Comments
