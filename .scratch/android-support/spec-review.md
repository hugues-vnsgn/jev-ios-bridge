# Review: v1.2.0 release spec (Android support)

Reviewed 2026-09-29 against the `## Answer` sections of tickets 01–08 and 10, ticket 09's "Known inputs", `map.md`, ADR-0004, ADR-0005, the findings, `docs/research/mobilecli-dependency.md`, the v1.0.0 spec, and the code at `1ce5a1d` (`spike/android-emulator`). Read-only: nothing was run against a device.

## Verdict

The spec is close to executable. It covers every ticket Answer and every item in ticket 09's known inputs, the phases are in a sensible order, and the device rules are stricter than the map in most places. I re-rendered the 10 prototype captures with `element-mapping.cjs` at `2366759`, and all 10 match `jev-check/observations/*.txt` byte for byte, so the phase 4 golden gate can be met. It isn't ready to hand off, though. Two contract problems would stop the executor in phase 3 under the spec's own golden-file rule:

- adding `APP_NOT_INSTALLED` as a bridge code changes the iOS `report.json` golden entry;
- the MCP input-schema golden can't take Android scripts without changing existing entries.

Two open-point defaults (5 and 6) contradict an Answer or the spec's own rules, so the executor would have to stop there too. Several device-safety gaps are also left open: manual mobilecli use without the guard environment, paired iPhones, the app install method, and a cleanup gate that another agent's processes could fail. Settle these with the owner before handoff. The rest are should-fix clarifications and minor points.

## Findings

### 1. Blocker: the new `APP_NOT_INSTALLED` code changes iOS reports and an existing golden entry

- **Spec:** Phase 3 item 3 adds "`APP_NOT_INSTALLED` | The app's package isn't installed on the device." The Rules say "`report.json` for iOS runs … stay as they are" and "Anything else that changes in an existing golden file is a bug."
- **Source:** `src/scripted/run.ts:120-121` passes any vendor code that is already a bridge code straight through: `if (isReasonCode(error.code)) return { code: error.code }; return { code: 'DEVICE_ERROR', …vendorCode }`.
  - `tests/contract.test.ts:153` builds the iOS `deviceError` golden run from `new DeviceCliError('APP_NOT_INSTALLED', 'not installed', true)`.
  - `tests/golden/report-json.json` records that run as `"reason": "DEVICE_ERROR"` with `"vendorCode": "APP_NOT_INSTALLED"`.
  - ADR-0005 says "an unknown MobileBuildMCP code becomes `DEVICE_ERROR`, with the vendor code kept as detail."
  - Once `APP_NOT_INSTALLED` is a bridge code, that golden entry becomes `reason: APP_NOT_INSTALLED` with no `vendorCode`. Any real MobileBuildMCP error with that name would change meaning the same way. (MobileBuildMCP 2.7.1's build doesn't contain the string today, but the pass-through makes any future collision silent.)
- **Fix:** Scope the pass-through by driver. Either the MobileBuildMCP driver passes through only the 1.1 vocabulary (a frozen set) and wraps everything else as `DEVICE_ERROR` + `vendorCode`, or the Android driver raises its bridge-owned codes through a separate error type. Add a test that an iOS vendor `APP_NOT_INSTALLED` still reports `DEVICE_ERROR` with `vendorCode`, and say in phase 3 that the `deviceError` golden entry must stay byte-identical. Also check every new name (`DEVICE_LOCKED`, `DEVICE_NOT_BOOTED`, …) against MobileBuildMCP's codes.

### 2. Blocker: Android scripts can't fit the MCP input-schema golden under the stated rule, and the rule's allowances don't match the golden files

- **Spec:** The Rules allow an existing golden entry to change only for "the rewordings that … item 9 lists (the `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` descriptions, the `start_scenario` description, the CLI help), and new items added to a list or schema that already exists (… new optional script fields in the MCP input schema)." Phase 3 item 1 requires `app.package` instead of `app.bundleId` on Android, and non-ASCII values.
- **Source:** `src/mcp/index.ts` publishes `scriptedScenarioSchema` as the `start_scenario` input schema. `tests/golden/mcp.json` has `app.required: ["bundleId"]` and `values.additionalProperties.pattern: "^[\\x20-\\x7e]*$"`. Both must change for an Android script to validate: `bundleId` can't stay required, and the ASCII pattern can't stay on the field.
  - `tests/golden/scripts.json` records `path` as well as `message`, for example `nonKeyboardValue` at `values.query` and `leadingHyphenValue` at `values`. Moving the checks into a platform-aware refinement can change paths, and it also changes when they are reported: zod runs a refinement only after the base object parses.
  - The allowances the spec names don't exist in any golden file. `mcp.json` has no `description` keys, `vocabulary.json` holds code names only, and `cli-exit-codes.json` records exit codes only.
  - Ticket 08 item 5 says "Golden files change only for the reason-code and MCP descriptions reworded". Ticket 07 item 8 says "New golden entries are added, and existing entries don't change."
- **Fix:** Pick the schema shape in the spec. For example, keep one object with `app.bundleId` optional, and add a platform-aware refinement that emits the iOS messages at the same paths. Then list the exact expected `mcp.json` diff (`bundleId` leaves `required`, the values pattern leaves the field, new optional properties) and get the owner's sign-off, since it's a published tool schema. That diff is additive under ADR-0005 because it accepts more and invalidates nothing. Require every existing `scripts.json` entry to stay byte-identical, including paths. Rewrite the Rules' allowance list to name the diffs that will actually happen.

### 3. Should fix: open point 5's default changes iOS reports, which the spec's rules forbid

- **Spec:** Open point 5 says "`platform` (… on every report), plus `package`, `activity` and `intentExtras` (`null`, `null` and `{}` on iOS). They are also recorded in the `started` event." The Rules say "`report.json` for iOS runs … stay as they are."
- **Source:** `tests/golden/report-json.json` has three iOS entries (`passed`, `failed`, `deviceError`). `tests/golden/evidence-layout.json` records `startedFields` from an iOS run. The default changes all of them. Ticket 08 item 5 limits golden changes to the reworded descriptions. ADR-0005 would allow the new fields, but this spec's rule and ticket 08 don't, so the executor must stop at this point.
- **Fix:** Default to Android-only fields: write `platform`, `package`, `activity` and `intentExtras` only on Android runs, and leave iOS reports and `started` untouched. If the owner prefers `platform` on every report, list it as an approved golden diff. Separately, the research note (§5) recommends that "the report should name both the serial and the mobilecli ID"; the default puts them only in `prepared`. Record that choice deliberately.

### 4. Should fix: open point 6's default contradicts ticket 01's Answer

- **Spec:** Open point 6: "Default: one private home per run, `<tmpdir>/jev-mcli-<pid>-<n>`." Phase 1 item 5 leaves the ADR wording open ("a private `MOBILECLI_HOME`").
- **Source:** Ticket 01's Answer says "give each bridge process a private `MOBILECLI_HOME`". The map says "a private `MOBILECLI_HOME` per bridge process". The spec's own rule is "If a default would contradict an Answer, stop and ask."
- **Fix:** The reasoning is sound: one MCP process can drive two emulators, and the first run's `close` would stop the second run's daemon. Have the owner accept per-run homes now, write it into phase 1 item 5 and phase 4 item 1, and remove it from the open points.

### 5. Should fix: the shown value after typing is a contract addition in ticket 09, but the default keeps it out of the frozen report

- **Spec:** Open point 11 says "on the `action` event as `shownValue` … `report.json` doesn't change for them."
- **Source:** Ticket 09's known inputs list "the report records a field's shown value after typing" under **Contract additions**. Ticket 05 item 3 says "the step records the field's shown value in the report". Ticket 05 item 4 says "A password field's content never reaches the report or Jev".
- **Fix:** Ask the owner whether "the report" means `report.json`. If it does, add an optional per-step field. If it doesn't, move the item out of "contract additions" in the spec's framing. Either way, state that `shownValue` for a password field is the dots from the mapping, never the raw text; a classic field briefly shows its last character (`findings/05-actions.md`, "`••••••!`").

### 6. Should fix: manual mobilecli use isn't required to use the guard environment, and `mobilecli daemon stop` can hit someone else's daemon

- **Spec:** The Rules say "Clean up mobilecli fully after any use, including your own manual use: `mobilecli daemon stop`, `adb shell pkill -f com.mobilenext.mobilecli.DeviceServer`, and `adb forward --remove` of its forward."
- **Source:** Every evidence run used a guarded wrapper (`findings/05-assets/env.sh`, `findings/06-assets/mcli.sh`): private `MOBILECLI_HOME` and `XDG_CONFIG_HOME`, `MOBILECLI_FLEET_URL=ws://127.0.0.1:9`, `unset MOBILECLI_TOKEN`, a dead `USBMUXD_SOCKET_ADDRESS`, and a refusal when any non-emulator serial is listed. Research §4 says a shared default home makes clients of different versions restart each other's daemon. The map notes another agent is working on the Xiaomi.
  - A bare `mobilecli …` uses `~/.mobilecli`. It can reuse or restart another tool's daemon, read the keychain token, and `daemon stop` would stop that daemon.
  - `adb shell pkill` without `-s` fails once both emulators are booted (phase 8).
- **Fix:** Require manual mobilecli use to go only through a wrapper equivalent to `mcli.sh`, with the pinned binary, private home and XDG, the fleet guard, a dead usbmuxd socket, and the emulator-only guard. Forbid `mobilecli daemon stop` against the default home. Write the cleanup commands with `-s <serial>` and the private `MOBILECLI_HOME`.

### 7. Should fix: paired iPhones aren't hidden during evidence runs

- **Spec:** The Rules say "Never touch the Xiaomi `2985e9c` …, any other phone, or BFSOne." Phase 4 item 1 lists `mobilecliEnvironment()` without `USBMUXD_SOCKET_ADDRESS`.
- **Source:** Ticket 01's Answer says "Its first device lookup still reads every Android phone and paired iPhone on the Mac." Research §3 lists `USBMUXD_SOCKET_ADDRESS=<dead path>` as an optional guard ("Tested: enumeration just skips iOS"). The private adb server hides USB Android phones, not iPhones. Every bridge run in checks 3–5 and 9–10 would query any paired iPhone's lockdown info.
- **Fix:** Export a dead `USBMUXD_SOCKET_ADDRESS` for every Android evidence command, including the bridge and Claude Code in checks 9–10, but not for the iOS regression runs. Ask the owner whether the product's `mobilecliEnvironment()` should also set it. It's cheap and privacy-positive, but no Answer settled it.

### 8. Should fix: the install method isn't specified, and the obvious one can reach the Xiaomi

- **Spec:** Phase 8 says "Build and install the twin app (`examples/diagnostic-app-android` …) and `cmp` on both emulators."
- **Source:** `examples/diagnostic-app-android/README.md` gives the safe pattern: `./gradlew :app:assembleDebug`, then `adb -s emulator-5554 install -r app/build/outputs/apk/debug/app-debug.apk`. `gradlew installDebug` or an Android Studio run installs on every device its adb server sees. A Gradle daemon started without `ANDROID_ADB_SERVER_PORT=5099` would use port 5037, where the other agent's Xiaomi is attached.
- **Fix:** Build with `assembleDebug` only. Install with `adb -s <emulator serial> install -r <apk>` through the private server, after the `adb devices` check. Forbid `install*` Gradle tasks and IDE installs. Give the APK paths.

### 9. Should fix: `cmp`'s location, module and package are missing

- **Spec:** The Rules say "Build the owner's `cmp` app where it is, without editing its source." Checks 3–4 use `cmp`.
- **Source:** `docs/research/compose-cmp-capture.md` says "App under test: `~/Codes/cmp` (not a git repo)". The v1.0.0 spec names `~/Codes/cmp`. `~/Codes/cmp/androidApp/build.gradle.kts` has `applicationId = "org.example.project"` and minSdk 24.
- **Fix:** Name the path (`~/Codes/cmp`), the task (`./gradlew :androidApp:assembleDebug`), the APK path and the package (`org.example.project`, to verify), and say that its build output lands in the owner's tree. Note that its Compose views lack `testTagsAsResourceId`, so its scripts need `role` plus `label` selectors.

### 10. Should fix: the cleanup gate can't be checked as written on a shared Mac

- **Spec:** Check 6 requires "No mobilecli daemon on the Mac, no `DeviceServer` on the device, no `localabstract:mobilecli-server` line in `adb forward --list`, and no device lock in the lock folder."
- **Source:** The map says another agent is using the Xiaomi. If that agent, or the owner's own mobile-mcp, runs mobilecli on `~/.mobilecli`, a Mac-wide "no mobilecli daemon" check fails for reasons the bridge didn't cause. With per-run homes, the daemon's arguments (`daemon start --insecure-storage --idle-timeout 5m`) don't say which home it belongs to. The lock folder `jev-ios-bridge-device-locks` is shared with iOS runs.
- **Fix:** Define the gate precisely:
  - record a `pgrep -fl mobilecli` baseline before the first Android run, and require no new mobilecli processes afterwards;
  - require no leftover `$TMPDIR/jev-mcli-*` directory;
  - require `adb -s <serial> shell pgrep -f com.mobilenext.mobilecli.DeviceServer` to return nothing;
  - require no forward line for that serial;
  - require no lock file named after that AVD or serial.

### 11. Should fix: forward lookup and removal don't filter by serial, and phase 8 runs two emulators at once

- **Spec:** Phase 4 item 4 says "find the `localabstract:mobilecli-server` port in `adb forward --list`". Item 8 says "`adb forward --remove tcp:<port>` for the `localabstract:mobilecli-server` line". Phase 8 boots both AVDs.
- **Source:** Research §4 says "find the `localabstract:mobilecli-server` line in `adb -s <serial> forward --list`, then run `forward --remove tcp:<port>`". `forward --list` prints every device's forwards, with the serial in the first column.
- **Fix:** Match the run's serial in column 1, and run `adb -s <serial> forward --remove`. Add a fake-runner test where the listing holds both emulators' forwards.

### 12. Should fix: the process-event stream has no start time, so an old native crash can mark a fresh launch as exited

- **Spec:** Phase 5 item 4 says "A second small stream, `adb logcat -b events` filtered to `am_crash`, …" and "Match a native crash by package name plus `Native crash`."
- **Source:** `findings/06-assets/exit-watch.mjs:13` matches a native crash for the package whatever its pid. Without `-T`, `logcat -b events` replays the buffer, so a native crash from an earlier run is read as a crash in this one. Findings line 22 also subscribes to `am_proc_start`.
- **Fix:** Start the events stream from the same device time (`-T <device time>`), read before `am start -W`, as the log stream does. Keep `am_proc_start` if the watcher needs it. Add a fixture test with a stale native crash at the head of the buffer.

### 13. Should fix: `device.serial`, `device.avd` and `JEV_ANDROID_DEVICE` have no pattern, so "malformed" is undefined and a name can leave the lock folder

- **Spec:** Phase 3 item 1 defines "`device.serial` … or `device.avd`" without a character rule. Item 2 says "the CLI's pre-run check refuses a missing or malformed device with exit code 3."
- **Source:** `src/device/index.ts:260` builds the lock path as ``join(root, `${deviceId.toUpperCase()}.lock`)``, so an AVD name such as `../x` escapes the lock folder. The same strings reach `adb -s` and the device shell. iOS validates its UDID in the schema.
- **Fix:** Add patterns, for example AVD `^[A-Za-z0-9._-]{1,100}$` and serial `^[A-Za-z0-9._:-]{1,100}$`, applied to the script fields and to `JEV_ANDROID_DEVICE`. Give the `INVALID_DEVICE` message for Android, and add golden cases.

### 14. Should fix: evidence scripts are written after the candidate commit, and the quickstart clones a tag that doesn't exist yet

- **Spec:** Phase 8 says "Author the six Android scripts …" and "Run every check on the candidate merge commit (the last of phases 1 to 7)". Open point 17 says "`examples/diagnostic-app-android/scenario.json` holds twin-fail (the quickstart uses it)". Phase 7 item 2 writes the quickstart.
- **Source:** The iOS quickstart clones `--branch v1.1.0` and uses `examples/diagnostic-app/scenario.json` (`docs/guide/01-quickstart.md:60,72`). The Android section will clone `v1.2.0`, which is only tagged in phase 9. The v1.0.0 spec's check 7 records "Pre-tag deviations recorded".
- **Fix:** Author and commit the scripts, at least `examples/diagnostic-app-android/scenario.json`, in phase 7 or a small phase 7b PR, so they are part of the candidate. Say which PR carries the rest. For check 10, say to substitute the candidate commit for the tag and record it as a pre-tag deviation.

### 15. Should fix: how the TypeSafe key reaches the plugin in checks 9–10 and phase 9 isn't specified

- **Spec:** Open point 18 says "install from the local build …, passing the Android device with `--config`." Check 9 says "The MCP server starts". The Rules say "Never read, print, copy … `.env` or any credential file."
- **Source:** `plugin/plugin.json` has `typesafe_api_key` with `"sensitive": true, "required": true`, and sets the server env `TYPESAFE_API_KEY` from `${user_config.typesafe_api_key}`. `plugin/README.md` says "A missing key stops the MCP server." So check 9 can't pass without the key in the plugin's secure storage. Passing it with `--config` puts it on a command line, and a throwaway `CLAUDE_CONFIG_DIR` may still write to the real keychain.
- **Fix:** Name the method. Either the owner enters the key interactively (a stop-and-ask), or define a no-echo route. Also say how to remove the throwaway config and any keychain item afterwards.

### 16. Minor: the device lock is taken after the device is already changed

- **Spec:** Phase 4 item 2 orders the checks, then "Wake a screen that is only off", then "Take the shared device lock". The restart and the `DeviceServer` start follow.
- **Fix:** Take the lock right after resolving the mobilecli ID, before any wake, `force-stop` or `DeviceServer` start. Do the same in `capture`.

### 17. Minor: permanent vocabulary is left to executor defaults

- **Spec:** Open point 3 adds `DEVICE_UNSUPPORTED` and `ANDROID_TOOLS_MISSING`. Open points 5, 11 and 12 shape report fields and `capture`'s exit codes.
- **Source:** ADR-0005 says "Renaming, removing, or changing the meaning of anything frozen … needs 2.0." Once shipped, these can't be undone in 1.x.
- **Fix:** Have the owner settle open points 3, 5, 11 and 12 before handoff. For open point 3, `ANDROID_TOOLS_MISSING` for "reports another version" is a misleading name; consider a separate code or `DEVICE_ERROR` with `vendorCode: mobilecli`.

### 18. Minor: ADR-0004 has no gate for future changes to the Android view

- **Spec:** "There is no new Jev corpus: check 2's golden test stands in for it."
- **Source:** ADR-0004 says "Adopting a new model, or changing the observation text sent to Jev, requires the corpus gate", and the frozen corpus is iOS-only. Nothing says what a later change to `android-full-text-v1`, or a Jev model bump, must pass on Android.
- **Fix:** Ask the owner whether ADR-0006 or `11-stability.md` should say that such changes re-run the 10-screen check (ticket 04's claims), with zero confidently wrong answers.

### 19. Minor: phase 2's "tests pass unchanged" needs the renderer's platform parameter to be optional

- **Spec:** Phase 2 says "Every existing test and golden file passes unchanged" and "`renderAssertionState` … takes the platform."
- **Source:** `tests/scripted-jev.test.ts:28` and `tests/scripted-production-parity.test.ts` call `renderAssertionState(snapshot)` with one argument.
- **Fix:** Say the platform parameter defaults to iOS, or pass it inside `Snapshot`.

### 20. Minor: it's unclear whether the renderer or the mapping produces password dots

- **Spec:** Phase 3 item 4 lists password dots under "The element and Jev's view", and its golden test covers "the Android renderer on … a password field". Phase 4 item 5 puts dots in the mapping.
- **Source:** `Element` (`src/contracts/index.ts`) has no password flag, so the renderer can't tell.
- **Fix:** Say the mapping writes the dots into `value`, so the renderer, selectors, `capture` and `shownValue` all see dots. The phase 3 test then uses an element whose value is already dots.

### 21. Minor: "any node with `scrollable: true` is a `scroll-view`, whatever its class" can swallow multi-line text fields

- **Spec:** Phase 4 item 5.
- **Source:** Findings Q6 uses the same words, so this isn't a contradiction. A multi-line classic `EditText` reports `scrollable=true`, though, and would lose `typeText`.
- **Fix:** Apply the text-field rule before the scrollable override, and add a fixture for it.

### 22. Minor: the iOS log-pane change isn't checked live

- **Spec:** Phase 5 item 5 says "It now takes the driver's `appRunning`, on both platforms, in this same change." Check 7 re-runs the iOS benchmarks only.
- **Source:** `src/logpane/stream.ts:93` reads `_helperpid`, and `tests/logpane.test.ts:67` tests that path.
- **Fix:** Add one iOS run with the pane open to check 7, or state that updated unit tests are the only evidence.

### 23. Minor: check 7 (iOS regression) doesn't say how to run it

- **Spec:** "One run each of Weather, Contacts, Reminders and the iOS diagnostic app on the dedicated simulator, expecting 1.0's verdicts."
- **Source:** The v1.0.0 spec used `spikes/benchmarks/run-bridge.mjs` and simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`, and said "rebuild and reinstall Weather, the diagnostic app …" first.
- **Fix:** Name the harness, the scripts (`spikes/benchmarks/scenarios/{weather,contacts,reminders}-scripted.json`, `examples/diagnostic-app/scenario.json`), the UDID, the rebuild and reinstall step, and the four expected verdicts.

### 24. Minor: the Xiaomi checklist has no path

- **Spec:** Check 8 says "Write the Xiaomi checklist". The report-back list asks for "the path of the Xiaomi checklist".
- **Fix:** Give a path, for example `spikes/benchmarks/results/v1.2.0/real-phones/xiaomi-checklist.md`, committed in the phase 9 records PR.

### 25. Minor: the new CLI exit-code test depends on the environment

- **Source:** `tests/contract.test.ts` (the `env()` helper around line 245) deletes only `TYPESAFE_API_KEY` and `JEV_DEVICE_UDID`.
- **Fix:** Say that the Android no-device case also deletes `JEV_ANDROID_DEVICE`. Otherwise `npm run check` in a shell set up for evidence runs gives a different exit code.

### 26. Minor: "empty counts as unset" changes iOS CLI behaviour

- **Spec:** Phase 6 item 4 says "An empty value must count as unset for both settings."
- **Source:** Today `src/cli.ts:96` passes `process.env.JEV_DEVICE_UDID` into `selectDeviceId`, where `scriptUdid ?? defaultUdid ?? configured` turns `""` into `NO_DEVICE` without reading `.mobilebuildmcp/config.yaml`. The driver in `src/cli.ts` already ignores an empty value.
- **Fix:** Say this is an intended iOS change (an empty value now falls through to `config.yaml`), and put it in the CHANGELOG's "Changed".

### 27. Minor: `capture` becomes frozen CLI surface

- **Source:** ADR-0005 freezes "the MCP tools and CLI".
- **Fix:** Say in phase 7 (`11-stability.md`) which parts of `capture` are stable (flags, exit codes, the fields named) and that element lines may gain fields.

### 28. Minor: check 11 doesn't test mobilecli from the tarball

- **Spec:** Check 11 checks versions, the file list and the skill.
- **Fix:** Also confirm that `pinnedMobilecli()` resolves after `npm install <tgz>`, for example `capture --avd NoSuchAvd` exits 3 with a device code, not a tools-missing code. Only check 9 covers the binary today.

### 29. Minor: an out-of-scope line reads too broadly

- **Spec:** "CI or headless emulator farms, and running the bridge in CI."
- **Source:** The v1.1.0 notes offer the tarball "For the command line, Codex, or CI". The map's out-of-scope list has only "CI and headless emulator farms".
- **Fix:** Reword it as "Android runs in CI or on headless emulator farms."

## Responses (spec author, 2026-09-29)

Every finding was checked against the code or the source it cites before changing the spec. All 29 were accepted in substance. Where the fix differs from the reviewer's suggestion, the reason is given.

| # | Handling |
| --- | --- |
| 1 | Fixed. Confirmed in `run.ts` `failureOf` and the `deviceError` golden run. Phase 3 item 3 now scopes the pass-through: MobileBuildMCP errors pass through only the frozen 1.1 codes, and the Android driver raises its codes on its own path. It adds a test that an iOS vendor `APP_NOT_INSTALLED` stays `DEVICE_ERROR` with its vendor code. |
| 2 | Fixed. Confirmed in `tests/golden/mcp.json` (`required: ["bundleId"]`, the ASCII pattern on `values`). Phase 3 item 1 now fixes the schema's shape and lists the exact `mcp.json` diff, and `scripts.json` messages and paths must stay byte-identical. The Rules name the real golden diffs, and the rewordings are noted as being in no golden file. The `mcp.json` change is owner decision A, because ticket 08 item 5's wording doesn't allow it. |
| 3 | Fixed with the reviewer's first option: the new fields are written on Android runs only (open point 5, owner decision C). |
| 4 | Fixed. Per-run homes are now owner decision B, written into phase 1 and phase 4. |
| 5 | Fixed. The default now adds an optional `typedFields` array to `report.json` on Android runs, and says a password's shown value is dots (open point 11, owner decision D). |
| 6 | Fixed. The Rules require a guarded wrapper for manual mobilecli use, forbid the default home, and give the cleanup commands with `-s <serial>`. |
| 7 | Fixed for the evidence runs (a Rules bullet). The product default is a new open point 21 (recommended: set it), since no Answer settled it. |
| 8 | Fixed. The Rules forbid Gradle `install*` tasks and IDE installs, and phase 8 gives the build and `adb -s … install` commands. |
| 9 | Fixed. The path `~/Codes/cmp`, the Gradle task and the package `org.example.project` (checked in `androidApp/build.gradle.kts`) are in the Rules, with "confirm before writing scripts". |
| 10 | Fixed. Check 6 now takes a `pgrep` baseline and scopes each check to the run's emulator. |
| 11 | Fixed in phase 4 items 4 and 8, with a two-emulator test. |
| 12 | Fixed. The events stream starts from the same device time, and a stale-crash fixture test is added. |
| 13 | Fixed. The patterns are open point 20, and phase 3 requires them. |
| 14 | Fixed. The evidence scripts moved into phase 7 (item 11), so they are part of the candidate, and check 10 records the pre-tag deviation. |
| 15 | Fixed. The owner types the key into Claude Code's prompt (a stop-and-ask). `--config` never carries it. The throwaway config is deleted afterwards, and the owner is told about any secure-storage item. |
| 16 | Fixed. The lock is taken right after resolving the ID, in runs and in `capture`. |
| 17 | Partly. The tools code is renamed `ANDROID_TOOLS_UNAVAILABLE` to cover a wrong version. Rather than settle the permanent names myself, I listed them as owner decision E. |
| 18 | Added as phase 1 item 8 and owner decision F. |
| 19 | Fixed: the platform parameter defaults to iOS. |
| 20 | Fixed: the mapping writes the dots into `value`. |
| 21 | Fixed: the text-field rule comes before the `scrollable` override, with a fixture. |
| 22 | Added as check 13, **report-only**. Ticket 08 doesn't list an iOS pane gate, and I didn't want to invent a blocking one. Updated unit tests remain the blocking evidence. |
| 23 | Fixed. Check 7 names the harness, the four scripts, the UDID and the expected verdicts. I checked that `run-bridge.mjs` takes any script path. |
| 24 | Fixed: `spikes/benchmarks/results/v1.2.0/real-phones/xiaomi-checklist.md`. |
| 25 | Fixed in phase 3 item 8. |
| 26 | **Different fix.** I don't want an iOS behaviour change that no ticket asked for. The spec now makes only an empty `JEV_ANDROID_DEVICE` count as unset, and leaves the iOS CLI's handling of an empty `JEV_DEVICE_UDID` as it is. The MCP path, which the plugin uses, already ignores an empty value, so an Android-only plugin user can still start the server. |
| 27 | Fixed in phase 7 item 8 (`11-stability.md`). |
| 28 | Fixed: check 11 runs `capture --avd NoSuchAvd` from the tarball install. |
| 29 | Fixed: "Android runs in CI or on headless emulator farms." |

**Disagreements:** only #26, where I avoided the iOS change instead of documenting it, and #22, where I made the new check report-only instead of blocking. Everything else was accepted as found.
