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

- 2026-09-29, implementer-03: resumed after an earlier session was interrupted. Audited its four commits
  (823e0de claim, 20221b9 schema + app-identity reshape, 3c5916b service/MobileBuildMCP seam tests, 53e2edc
  scripts.json goldens) against this ticket's acceptance and the release spec's phase 3 item 1:
  - Script fields, the schema's platform-aware refinement, and the `mcp.json` diff match item 1 and owner
    decision A exactly (`bundleId` leaves `app.required`, the ASCII pattern leaves
    `values.additionalProperties`, and `platform`/`app.package`/`app.activity`/`app.intentExtras`/
    `device.serial`/`device.avd` appear as optional properties, nothing else in that file moves).
  - Every existing `scripts.json` entry is untouched byte-for-byte (`git diff` against the pre-Issue commit
    shows only added lines); the new entries cover both device-name patterns, the serial/avd conflict,
    every rejected-field case, an Android typed value with a leading hyphen and non-English Unicode, a
    control character rejection, and an iOS script using an Android field.
  - `tests/logpane.test.ts` changed only the two ruled-on calls (lines 45, 70); `tests/device.test.ts` and
    `tests/service.test.ts` only gained new tests, no existing assertions changed.
  - The app's identity reshape (`AppIdentity`, `isIosApp`) is used consistently by `BridgeService`,
    `MobileBuildMcpDriver`, and `startLogStream`; two spikes files needed a one-line fixup each to keep
    compiling under the reshaped type (they're in `tsconfig.json`'s `include`, so `npm run typecheck`
    covers them).
  - Missing: `docs/guide/reference/script-format.md` had no mention of the new fields (item 5). Added a
    red-then-green test to `tests/docs.test.ts` (`script-format reference documents platform and the
    Android app/device fields`) and documented `platform`, `app.package`/`activity`/`intentExtras`, and
    `device.serial`/`avd` in the reference doc.
  - Considered narrowing `ScriptedScenario.app.bundleId` to optional in `src/scripted/contracts.ts` for
    type accuracy on Android scripts, but reverted: it breaks `exactOptionalPropertyTypes` assignability
    to `AppIdentity` at three call sites and would need a discriminated-union reshape of `ScriptedScenario`
    itself, which is out of this Issue's scope and not required by any test or acceptance criterion.
  - `npm run check` passes (typecheck, 200 tests, build) at the branch tip.

- 2026-09-29, implementer-03: review round 1 fixes.
  - Restored the exact legacy message and path for an iOS script missing `app.bundleId`
    ("Invalid input: expected string, received undefined" at `app.bundleId`), pinned by a new
    `missingBundleId` golden entry.
  - Reordered the schema's `superRefine` (app/device, then values, then steps) so an iOS script's issue
    list is byte-identical to 1.1's again; pinned by a new `iosMultipleErrors` golden entry (a malformed
    `app.bundleId`, a non-ASCII value, and a duplicate step id, in that order).
  - Fixed `app.activity`'s pattern: a bare name with neither a leading dot nor an internal one (for example
    `MainActivity`) is now rejected, since `am start` can't tell it apart from a package-relative form.
    Pinned by `androidActivityBareName`.
  - Pinned six more exact messages from item 1's limits: `app.intentExtras` over 20 entries, a non-ASCII or
    over-200-character intent extra value, a malformed `app.package`, an Android typed value over 2,048
    characters, and more than 32 typed values on an Android script.
  - Reshaped `ScriptedScenario` into `ScriptedScenarioIos | ScriptedScenarioAndroid` (discriminated on
    `platform`), with `IosAppIdentity`/`AndroidAppIdentity` defined once in `src/contracts/index.ts` and
    reused by `AppIdentity`, `isIosApp`, and both scenario variants, and `Platform`'s literal union
    collapsed into one `PLATFORMS` tuple reused by the zod schema. Fixed every call site the compiler then
    flagged: `run.ts`'s `started` event now writes `bundleId: null` on an Android run (iOS stays
    byte-identical; the other Android `started` fields are a later phase's addition), and `cli.ts` /
    `prepareContext()` pass no device for an Android script, since no driver reads it yet.
  - Dropped the tracker citations from `schema.ts`'s comments in favor of plain-language reasons.
  - Restored `tests/service.test.ts`'s `DeviceDriver` import to its original line, put the new imports on
    their own line, and dropped the `isIosApp` assertion that repeated what the preceding `deepEqual`
    already proved. `tests/device.test.ts` now asserts the MobileBuildMCP driver's full refusal message
    instead of a loose `/iOS/` regex.
  - `npm run check` passes (typecheck, 200 tests, build) at the new branch tip.

- 2026-09-30, implementer-03: review round 2 fixes, under the owner ruling recorded the same day on the
  feature branch at 3d5f0b6 (release spec item 1, this Issue's item 2, and the tracker spec's Rulings):
  scripts are now parsed by platform, not by one object schema plus a platform-aware refinement. Zod skips
  a refinement once the base object has already failed, so that design quietly changed 1.1's issue list for
  an iOS script with several errors; a review found 189 of 697 multi-error iOS inputs printed differently.
  - **Correction to round 1's comment above:** it said `tests/service.test.ts` "only gained new tests, no
    existing assertions changed." That became false partway through round 1/2: the `createDriver builds a
    driver per run…` test (existing since 819ea10) was edited to route `scenario.app.bundleId` through
    `isIosApp`. This round restores that test, and `tests/scripted-schema.test.ts`'s UUID-shape assertion
    (also edited in round 2), to their exact 819ea10 text; `git diff 819ea10 -- tests/` now shows only added
    lines in both files, plus the two sanctioned `tests/logpane.test.ts` calls elsewhere.
  - `src/scripted/schema.ts` now has three schemas: `iosScriptedScenarioSchema` (a byte-for-byte copy of
    the schema frozen at commit 819ea10, plus an optional literal `platform: "ios"`), `androidScriptedScenarioSchema`
    (Android's own schema, carrying forward this Issue's existing field rules and messages), and
    `scriptedScenarioSchema` (structurally unchanged, kept solely to generate the MCP tool's input schema;
    its now-pointless `superRefine` was dropped, which doesn't move `tests/golden/mcp.json` — a refinement
    was never reflected in a generated JSON Schema). `parseScriptedScenario`/`safeParseScriptedScenario`
    read the raw input's own `platform` field to route between the two real schemas: anything but the exact
    string `"android"` goes to iOS, whose schema then reports its own mismatch when `platform` is neither
    absent, `"ios"`, nor `"android"` (pinned by golden `unknownPlatform`).
  - Added `tests/scripted-schema-parity.test.ts` plus a frozen copy of `schema.ts`/`contracts.ts`/
    `vocabulary.ts` at 819ea10 under `tests/fixtures/frozen-schema-819ea10/`. It generates every single
    fault, and every pair and triple, of 17 ways an iOS script can be wrong (833 scripts) and asserts the
    live iOS schema's issue list matches the frozen one exactly, for every one of them.
  - Pinned the review's five example combinations as new `scripts.json` goldens (`nonAsciiValuePlusUnknownRole`,
    `leadingHyphenPlusMissingVersion`, `missingBundleIdPlusBadRole`, `missingBundleIdPlusDuplicateStepIds`,
    `missingBundleIdPlusBadUdid`, `missingBundleIdPlusValueTooLong`), verified byte-for-byte against the
    frozen 819ea10 schema before pinning.
  - Two existing Android goldens' messages legitimately changed, because Android fields are no longer
    declared on the iOS schema at all (previously a platform-aware refinement caught them post-hoc with a
    friendlier message): `iosScriptUsesAndroidPackage` and `iosScriptUsesAndroidSerial` now read
    `"Unrecognized key: \"package\""` / `"\"serial\""` at path `app` / `device`, zod's own strict-object
    message, instead of `"app.package requires \"platform\": \"android\""` / the `device.serial` equivalent.
    Every other existing Android golden (rejected fields, both device-name patterns, limits, `app.activity`)
    holds unchanged, since `androidScriptedScenarioSchema` still declares `bundleId`/`launchArgs`/`udid` as
    optional-but-flagged fields specifically so those keep their friendly custom messages.
  - `ScriptedScenario.app`/`device` go back to one flat field shape shared by both platform variants
    (`bundleId: string` always, `package`/`activity`/`intentExtras` always optional; `udid`/`serial`/`avd`
    all optional), so `script.app.bundleId` and `parsed.device?.udid` typecheck without narrowing, as they
    did before Android existed. `src/scripted/schema.ts` is what actually enforces each platform's fields;
    this type no longer tries to. `src/cli.ts` and `prepareContext()` (`src/scripted/run.ts`) revert to their
    pre-Android form for the same reason; the one place that still needs the platform for a real value, not
    just a type, is the `started` event's `bundleId` (`null` on Android runs), narrowed once into a local
    instead of calling `isIosApp` twice in one object literal.
  - Moved the `isIosApp(app) ? app.bundleId : app.package` pattern (previously the log pane's private
    `appLabel`, and repeated in this round's now-reverted service.test.ts edit) into one `appLabel` export
    beside the app identity types in `src/contracts/index.ts`, reused by the log pane.
  - Removed the tracker citations from `src/cli.ts` and `src/scripted/run.ts` ("phase 4", "a later phase's
    job/addition"); both spots that needed a comment now say what the code does in plain words, or need
    none now that the platform branching they explained is gone.
  - `npm run check` passes (typecheck, 201 tests, build) at the new branch tip.
- 2026-09-30, implementer-03 (takeover after round 2): fixed findings 1, 2, 4 to 9 of the round-2 review;
  finding 3 is blocked on an owner ruling (below).
  - MCP `start_scenario` validates with `scriptedScenarioSchema`, now a routing schema: `z.unknown()` whose
    refinement copies the issues of `safeParseScriptedScenario`, carrying the JSON Schema of an object that
    lists both platforms' fields (`scriptedScenarioStructure`, private). An invalid iOS script over MCP gets
    1.1's error text again; `tests/mcp.test.ts` pins six cases, each text taken from a 1.1-equivalent server
    (the frozen 819ea10 schema behind the same tool registration). The published tool schemas stayed
    byte-identical to `tests/golden/mcp.json`, key order included.
  - `tests/contract.test.ts`'s import and `scriptedScenarioSchema.safeParse(input)` line are back to their
    819ea10 text. `git diff 819ea10 -- tests/` removes only the two logpane calls and the `mcp.json` lines.
  - New guard: every script the `scripts.json` golden accepts (3 iOS, 4 Android) is accepted by
    `start_scenario` through a real MCP server.
  - The parity test runs through `parseScriptedScenario`, `safeParseScriptedScenario` and the MCP
    `scriptedScenarioSchema`, with and without an explicit `"platform": "ios"`, and compares parsed output,
    issues and `z.prettifyError` text with 1.1; no casts.
  - `runScriptedScenario` passes an Android script's device to the driver as nothing (Issue 06 chooses the
    Android device). New tests pin the `started` event: iOS keys and order unchanged, Android `bundleId: null`.
  - Each app, device and typed-value field is defined once and shared by the iOS, Android and MCP schemas.
  - Comments: no tracker or ruling references in `src/`; every frozen fixture says it's never updated.
  - **Blocked, finding 3.** True types (iOS `app: IosAppIdentity`, `device?: { udid? }`; Android
    `app: AndroidAppIdentity & { bundleId?: never; launchArgs?: never }`, `device?: { serial?; avd?;
    udid?: never }`) leave exactly one compile error, in an existing 819ea10 test:
    `tests/service.test.ts(134,18): error TS2345: Argument of type 'string | undefined' is not assignable
    to parameter of type 'string'.` (`built.push(scenario.app.bundleId);`, where `scenario` takes its type
    from `BridgeService`'s `createDriver: (scenario: ScriptedScenario) => DeviceDriver`). No true type makes
    that read a `string` while Android scripts can reach `createDriver`. Asked the owner to choose.

- 2026-09-30, implementer-03: finding 3 fixed under the owner's ruling the same day (option A).
  - `ScriptedScenario` is now typed per platform: `ScriptedScenarioIos` has `app: IosAppIdentity` and
    `device?: { udid? }`; `ScriptedScenarioAndroid` has `app` with `package` required and
    `bundleId?: never`/`launchArgs?: never`, and `device?: { serial?; avd?; udid?: never }`. The `never`
    fields mark those keys absent while keeping a platform-blind read such as `script.device?.udid`
    compiling (`src/cli.ts`, the existing `tests/scripted-schema.test.ts` UUID test).
  - The ruled edit: `tests/service.test.ts` line 134 is now `built.push(appLabel(scenario.app));`, with
    `appLabel` imported on this Issue's own import line. No other existing test line changed.
  - Red first: the Android run tests in `tests/scripted-run.test.ts` are now typed literals (no parser), and a
    new compile-time test uses `@ts-expect-error` to reject a bundle ID, launch arguments or a UDID on an
    Android script, and a package or serial on an iOS one.

- 2026-09-30, implementer-03: fix round 1 (three test-only standards findings).
  - The two new `start_scenario` tests (`tests/mcp.test.ts`, `tests/contract.test.ts`) share one helper,
    `tests/fixtures/mcp-session.ts` (`openMcpSession(clientName)` gives `callTool` and `close`). The two
    older MCP tests in `tests/mcp.test.ts` and the `mcp.json` golden test are unchanged, byte for byte.
  - The per-platform type test in `tests/scripted-run.test.ts` checks each rejected case against its own
    platform's type (`Extract`/`Exclude` of `ScriptedScenario`). Each case is otherwise valid: the iOS package
    case now carries a bundle ID, the Android bundle ID case a package. Removing the directives shows exactly
    one compile error per case, on the field it names. Added a missing-package Android case.
  - Dropped the second `import type` line from `scripted/contracts.js`: the checkpoint is typed
    `ScriptedScenario['steps'][number]`, so the existing import line serves. Each module appears on one line
    among the added imports.
