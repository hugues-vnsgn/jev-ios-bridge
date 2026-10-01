# v1.2.0 release spec: Android support

Status: **accepted by the owner** (2026-09-29), after a fresh-agent review and two reviews by GPT-6-Astra ([`spec-review.md`](spec-review.md)). **Revised the same day by a domain-model session that redesigned the Android device layer** ([`domain-model.md`](domain-model.md), [ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md)): the bridge never runs mobilecli, and drives mobilecli's device agent directly. Where a ticket's Answer describes mobilecli's CLI or daemon, the domain model wins ([decision G](#decisions-the-owner-accepted)). Written for Claude Code as the executor. The owner's decisions are [listed at the end](#decisions-the-owner-accepted).

This spec is an index of the decisions it depends on. Each phase names the tickets that hold its detail. Read a ticket's `## Answer` before starting its work: the Answer is the source of truth, and the [map](map.md) only gives the gist. Where this spec and an Answer disagree, stop and ask the owner. Don't pick one yourself. Where the tickets left a detail open, this spec says so under [Open points](#open-points-for-the-executor) and gives a recommended default.

## Goal

Ship **jev-ios-bridge v1.2.0** with Android support, as a regular GitHub release with the npm tarball and the Claude Code plugin zip, the way v1.1.0 shipped. The bridge drives Android emulators and phones through mobilecli plus `adb`. A script opts in with `"platform": "android"`. Android is additive: iOS scripts, reports and exit codes keep working unchanged under the 1.x contract ([ADR-0005](../../docs/adr/0005-the-1-0-stability-contract.md)). v1.2.0 ships after the emulator checks pass. Real Android phones are supported in code but marked untested until the owner's Xiaomi is free.

## Sources

| Decision | Source |
| --- | --- |
| Destination, owner decisions, device and secret rules, out of scope | [Map](map.md) |
| The Android device layer: the device agent, the device lease, the fence, the events | [Domain model](domain-model.md), [ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md) |
| mobilecli as a dependency: pin, licence, the agent's protocol and lifecycle (the CLI and daemon parts are superseded by the domain model) | [mobilecli as a dependency](issues/01-mobilecli-as-a-dependency.md), [`mobilecli-dependency.md`](../../docs/research/mobilecli-dependency.md) |
| Element mapping: roles, labels, lifted text, what is dropped | [How Android elements map onto the bridge's elements](issues/02-android-element-mapping.md); `spikes/android/element-mapping.cjs` on branch `prototype/android-element-mapping` |
| Script fields, device choice, restart, checks before a run | [How a script names an Android app and device](issues/03-script-and-device-identity.md) |
| What Jev sees: projection rule, header, `placeholder` | [What Jev sees on Android, and the 10-screen check](issues/04-what-jev-sees-on-android.md); `spikes/android/jev-check/` on the prototype branch |
| Tap, replace text, type, swipe, capture source, settle rule | [Actions across Android versions](issues/05-actions-across-android-versions.md), [findings](findings/05-actions.md) |
| Log pane, app-exit detection, `APP_NOT_RESPONDING` | [Log pane and app-exit detection on Android](issues/06-log-pane-and-app-exit.md), [findings](findings/06-log-pane.md) |
| Code layout, driver choice, shared parts, tests | [Where Android plugs into the code](issues/07-where-android-plugs-into-the-code.md) |
| Release checks | [Evidence plan and release gates for v1.2.0](issues/08-evidence-plan-and-release-gates.md) |
| The `/test-android` skill and the `capture` command | [The /test-android skill](issues/10-the-test-android-skill.md) |
| The spike this builds on | [Research and plan](plan.md) |
| How the last releases were checked and published | [v1.0.0 spec](../v1-release/release-spec.md), [`docs/releases/v1.1.0.md`](../../docs/releases/v1.1.0.md), [`plugin/README.md`](../../plugin/README.md) |

## Rules for the whole release

- **The 1.x contract ([ADR-0005](../../docs/adr/0005-the-1-0-stability-contract.md)).** Only add: optional script fields, reason codes, report fields, event types and a CLI command. Don't rename, remove or change the meaning of anything frozen, and don't make any valid script invalid.
  - iOS scripts, iOS error messages, `report.json` for iOS runs, and exit codes stay as they are.
  - **Golden files** (`tests/golden/`): add new entries freely. Existing entries may change only as follows, and anything else is a bug:
    - `vocabulary.json`: the new reason codes are appended to `reasonCodes`;
    - `mcp.json`: the `start_scenario` input schema changes exactly as phase 3 item 1 describes, which accepts more scripts and rejects none (owner decision A below);
    - every other existing entry stays byte-identical, including every `scripts.json` message **and path**, the three `report-json.json` runs, and `evidence-layout.json`'s `startedFields`.

    The rewordings in "Where Android plugs into the code" item 9 (the `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` descriptions, the `start_scenario` description, the CLI help) aren't in any golden file today. They change the docs and the source only.
  - **The iOS observation text doesn't change by a single byte.** [ADR-0004](../../docs/adr/0004-fixed-assertion-bounds-single-judgment.md) would require the corpus gate for any change.
- **Test first.** For every behaviour, write the failing test, then the code. The Android driver takes injected runners for `adb` and the device agent's client, as `CliRunner` does for MobileBuildMCP, so unit tests never need a device. CI runs on Linux without the Android SDK, and it must stay green.
- **One PR per phase.** Branch from `main`, push, open the PR, and wait for CI. **Ask the owner before merging.** Merge with a merge commit, delete the branch, and sync local `main`.
- **Never commit the owner's modified `.mcp.json`.**
- **Devices** (map, "Devices and secrets"):
  - Use only emulators: `Medium_Phone_API_36.1` (Android 16, usually `emulator-5554`) and `jev-actions-api31` (Android 12, API 31), or another emulator you create. Name them by AVD, since serials change with start order.
  - Never touch the Xiaomi `2985e9c` (another agent is using it), any other phone, or BFSOne.
  - **Run every Android command through a private adb server that hides USB phones:** `adb -P 5099 --one-device NO_SUCH_USB_DEVICE start-server`, with `ANDROID_ADB_SERVER_PORT=5099` exported for every command, including the bridge and Claude Code. Before each run, check that `adb devices` lists only `emulator-*` serials. Stop if it lists anything else.
  - Never run `adb kill-server` or any other command against the default server on port 5037: it belongs to the other agent. Kill only your private server when you finish.
  - **Never run mobilecli.** The bridge doesn't ([ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md)), and the evidence doesn't need it: look at screens with `jev-ios-bridge capture` once phase 6 lands.
    - **The one exception is making a foreign agent on purpose**, in phase 4's tracer and check 14. Do it only through a guarded wrapper like [`mcli.sh`](findings/06-assets/mcli.sh) and [`env.sh`](findings/05-assets/env.sh): the pinned binary, a private `MOBILECLI_HOME` and `XDG_CONFIG_HOME`, `MOBILECLI_TOKEN` unset, `MOBILECLI_FLEET_URL=ws://127.0.0.1:9`, a dead `USBMUXD_SOCKET_ADDRESS`, and a refusal when `adb devices` lists anything but `emulator-*`.
    - Never run mobilecli on the default `~/.mobilecli` home, and afterwards run `mobilecli daemon stop` on the private home only.
  - **Leave no device agent of yours behind** after any Android work, including a failed test. A running agent blocks every other UI tool until it's killed. Clean up by ownership, never by class name:
    - find the agent's pid with `adb -s <serial> shell ps -A -o PID,NAME,ARGS`, and check that it's yours: the bridge's own, whose `/proc/<pid>/environ` has `CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex` ([open point 22](#open-points-for-the-executor)), or a mobilecli agent you started yourself for the tracer or check 14. Then `adb -s <serial> shell kill <pid>`;
    - remove only the forward you or your run created: `adb -s <serial> forward --remove tcp:<port>`;
    - never run `pkill -f com.mobilenext.mobilecli.DeviceServer`: it also kills a foreign agent that isn't yours.
  - **Install apps only with `adb -s <emulator serial> install -r <apk>`** through the private server, after the `adb devices` check. Build with Gradle's `assembleDebug` only. Never use `installDebug`, any other Gradle `install*` task, or an IDE run: they install on every device their adb server sees, and a Gradle daemon started without `ANDROID_ADB_SERVER_PORT` uses port 5037, where the Xiaomi is.
  - The emulator's quickboot snapshot rolls back apps installed after it was taken. Boot with `-no-snapshot-save`, and check that the evidence apps are installed after each boot. Shut down an emulator you started.
  - Keep the Android 12 image and the `jev-actions-api31` AVD (about 5 GB). The owner decides later whether to delete them.
  - For the iOS regression runs, use only the dedicated simulator from the [v1.0.0 spec](../v1-release/release-spec.md)'s rules.
- **Secrets.** Load the Jev key from the main checkout's `.env` by an explicit path (`node --env-file=<main checkout>/.env …`), as [`AGENTS.md`](../../AGENTS.md) says. Never read, print, copy or commit `.env` or any credential file. To check that the key is set, test for the variable without echoing it. A live authentication failure is a blocker to report.
  - **The plugin checks (9, 10, and the install in phase 9) need the key in the plugin's settings.** Never pass it with `--config` or anywhere else on a command line. Stop and ask the owner to type it into Claude Code's prompt. Afterwards, delete the throwaway `CLAUDE_CONFIG_DIR`, and tell the owner that a secure-storage item may remain, so they can remove it.
- **Other people's repos.** The owner's `cmp` app is at `~/Codes/cmp` (not a git repo). Build it there, without editing its source, with `./gradlew :androidApp:assembleDebug`. Its build output lands in the owner's tree, as it did for 1.0. Its package is `org.example.project` in `androidApp/build.gradle.kts`: confirm it before writing scripts. If its captures show no identifiers, its scripts use `role` plus `label` selectors.
- **Where evidence goes:** `spikes/benchmarks/results/v1.2.0/`, one subfolder per check. Fill in the checks table in this file in phase 9's release-records PR.
- **Before phase 2:** the domain model, ADR-0006 and this revision land on `main` in one PR, after the owner accepts them. That PR also completes phase 1.
- **Stop and ask the owner when:**
  - a check fails for a cause outside the bridge (the device agent, the emulator, Android, TypeSafe, `cmp`, Settings), including an app crash you didn't cause;
  - this spec contradicts a ticket's Answer, or an open point's default turns out to be wrong;
  - a USB phone shows up on the private adb server;
  - Claude Code or a desktop session isn't available for a check that needs one.
- **A verdict that misses its expected one** gets a diagnosis, a fix, and one rerun. Never re-roll. If the fix is to a script rather than the bridge, record why.
- Run `unslop` over everything people read: docs, the skill, the CHANGELOG, release notes and PR bodies.

## Work, in order

Each phase is one PR. Unit and golden tests land with the phase that needs them. Phase 2 comes before the contract phase so that it can prove the refactors change nothing for iOS: its golden files stay byte-identical.

### Phase 1: ADR-0006, mobilecli's device agent as the Android device layer (done)

**Done in the redesign PR:** [`docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md`](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md), with the domain model ([`domain-model.md`](domain-model.md)) and the glossary in `CONTEXT.md`. It records:
- the device agent copied out of `mobilecli@1.0.14` and checked against a pinned SHA-256;
- the licence trade-off, unchanged from the owner's acceptance;
- the rejected options, including mobilecli's CLI and daemon;
- deliberate upgrades;
- one agent per device, with foreign agents refused;
- the fence;
- the gate for Android's view (owner decision F).

This replaces the earlier draft of this phase, which called mobilecli as a CLI with a private daemon home and network guards.

### Phase 2: refactors that change nothing for iOS ([Where Android plugs into the code](issues/07-where-android-plugs-into-the-code.md) items 1 to 4; [domain model](domain-model.md), decision H)

Every existing test and golden file passes unchanged in this PR.

1. **The driver factory.** Add one function in `src/device/` that builds the driver from the script's platform. `src/cli.ts`, which also serves MCP, passes it to `BridgeService` as `createDriver`. For now it only builds the MobileBuildMCP driver. One bridge process serves both platforms, so the driver is chosen per script, never per process.
2. **The device lease, shared** ([domain model](domain-model.md#device-lease), decisions G and H). Move the lease out of the MobileBuildMCP driver into `src/device/lease.ts`, used by both drivers. It holds:
   - taking and releasing the lease, keyed by the device identity;
   - the holder record: the run, the process, and what that run started that outlives a crash (for Android: its `logcat` processes on the Mac, its device agent's pid, and its forward port), updated as they start. A 1.1 bridge reads only the process, so the files stay compatible;
   - a dead holder losing the lease to the next run (`processAlive` in `src/device/index.ts`: an unknown owner is never assumed dead). The lease hands the dead holder's record to the new holder's driver, which sweeps it;
   - the in-flight ledger: what the iOS driver keeps today as `pendingOperations` and `unconfirmedCommands`. Each command is in flight, exited, unknown, or fenced;
   - the invariant: release only when nothing the run started can still act on the device. Otherwise keep the lease, and release it late once that can be shown (today's `finishWhenAcknowledged`);
   - a fence hook: a driver may declare every unknown command of one kind fenced once it has proven them dead. Android uses it in phase 4, and iOS never does.

   The iOS driver's behaviour doesn't change: its tests pass as they are, and the lock folder (`jev-ios-bridge-device-locks`) and file names stay, so a 1.1 and a 1.2 bridge still exclude each other. In code and docs the concept is called the **device lease** (the glossary's term). Update `docs/architecture.md` "One run" step 7 to the invariant's wording. `readLogTail` moves to a shared file too. Nothing else is shared: no base class, and the reference-refresh logic stays in the iOS driver.
3. **The tap alias rule moves onto the MobileBuildMCP driver.** Today `BridgeService` takes a process-wide `tapAliasRule` option and passes it to the run. Make the MobileBuildMCP driver carry the rule itself, for example as a read-only property that the run reads. Remove the option from `BridgeService` and `src/cli.ts`. Otherwise a process that serves both platforms would leak the rule onto Android runs.
4. **The renderer takes the platform.** `renderAssertionState` in `src/scripted/observe.ts` takes the platform, as an optional parameter that defaults to iOS so existing callers and tests don't change, and picks the header and projection rule from it. iOS keeps `Current iOS screen (full accessibility capture):` and `visible-full-text-v2`, byte for byte.
5. **`bridgeRole` moves into the iOS driver** (decision H). It translates MobileBuildMCP's roles, so it leaves `src/scripted/vocabulary.ts` for `src/device/`. The role list stays in the vocabulary.
6. **The app's identity replaces `bundleId` inside the code** (decision H): in `ScenarioContext`, `BridgeService` and the log pane's messages. The script field, `run.jsonl` and `report.json` keep `bundleId`, byte for byte. *(2026-09-29, owner ruling: phase 2 renames only what no existing test touches. `ScenarioContext.app` and `startLogStream`'s option move to phase 3 item 1.)*

### Phase 3: contract additions ([How a script names an Android app and device](issues/03-script-and-device-identity.md); [What Jev sees on Android](issues/04-what-jev-sees-on-android.md) decisions 1 to 2; [Actions across Android versions](issues/05-actions-across-android-versions.md) items 2 to 4; [Log pane and app-exit detection](issues/06-log-pane-and-app-exit.md) item 6; [Where Android plugs into the code](issues/07-where-android-plugs-into-the-code.md) items 4, 8 and 9)

1. **Script fields** (`src/scripted/schema.ts`, `contracts.ts`):
   - An optional top-level `platform`: `"ios"` or `"android"`. When it is absent or `"ios"`, the script is read exactly as today, and the Android fields below are rejected.
   - For `"platform": "android"`:
     - `app.package` is required. It follows Android's rule: two or more dot-separated parts, each starting with a letter, then letters, digits or `_` (`com.hugues.test_cmp` is valid).
     - `app.activity` is optional: relative (`.DebugGalleryActivity`) or fully qualified.
     - `app.intentExtras` is optional: string keys to string values, at most 20 entries, printable ASCII values of at most 200 characters (the `launchArgs` limits).
     - `device.serial` (the adb serial as `adb devices` prints it) or `device.avd` (an emulator's AVD name). A script names at most one of them. Both must match a character pattern ([open point 20](#open-points-for-the-executor)), because they reach `adb -s`, the device shell and the lock file's name.
     - Rejected: `app.bundleId`, `app.launchArgs` (the message points to `app.intentExtras`), and `device.udid`.
     - Typed values may start with `-`, and may be non-English text (see [open point 2](#open-points-for-the-executor) for the exact character rule).
   - iOS keeps its printable US-keyboard rule and its leading-hyphen ban, with the same messages **at the same paths**.
   - **The app's identity in code** (moved from phase 2 item 6 by the owner on 2026-09-29): reshape `ScenarioContext.app` once, as an iOS or Android identity (the bundle ID and launch arguments, or the package, activity and intent extras), and give `startLogStream` the app's identity instead of `bundleId`. Existing tests that build `app: { bundleId }` keep compiling, and the script field, `run.jsonl` and `report.json` keep `bundleId`.
   - **The schema's shape.** Scripts are parsed by platform: an iOS script (no `platform`, or `"ios"`) goes through the 1.1 schema unchanged apart from an optional `platform: "ios"`, so every iOS input, including one with several errors, gets exactly 1.1's messages, paths and order; an Android script goes through its own schema. One merged object schema (`app.bundleId` optional, the ASCII pattern off `values`, the new fields optional) exists only to generate the MCP input schema. The resulting `mcp.json` diff is exactly: `bundleId` leaves `app.required`; the pattern leaves `values.additionalProperties`; and `platform`, `app.package`, `app.activity`, `app.intentExtras`, `device.serial` and `device.avd` appear as optional properties. This is owner decision A. *(2026-09-30, owner ruling: this replaces "keep one object schema with a platform-aware refinement". Zod skips a refinement when the base object fails, so a single schema changed 1.1's output for iOS scripts with several errors.)*
2. **Choosing the device before a run.** Split today's `selectDeviceId` by platform. iOS is unchanged. Android takes the script's `device.serial` or `device.avd`, then `JEV_ANDROID_DEVICE` (a serial or an AVD name; an empty value counts as unset), then fails with `NO_DEVICE`. There's no config file and no "any device" shortcut. A run fails only when its own platform's device is missing: an Android run never needs `JEV_DEVICE_UDID`. As on iOS, the CLI's pre-run check refuses a missing or malformed device with exit code 3, and `INVALID_DEVICE`'s message names the Android patterns.
3. **Reason codes** (`src/scripted/vocabulary.ts`). Add these. The names are this spec's, because "How a script names an Android app and device" left the naming to it:

   | Code | Meaning |
   | --- | --- |
   | `DEVICE_NOT_CONNECTED` | The named serial isn't listed by adb or is offline, or no running emulator has the named AVD. |
   | `DEVICE_AMBIGUOUS` | More than one running emulator has the named AVD, so the bridge can't tell them apart. |
   | `DEVICE_UNAUTHORIZED` | The device hasn't accepted this Mac's USB-debugging key. |
   | `DEVICE_NOT_BOOTED` | The device hasn't finished booting. |
   | `DEVICE_LOCKED` | The device's screen is locked. |
   | `APP_NOT_INSTALLED` | The app's package isn't installed on the device. |
   | `APP_NOT_RESPONDING` | The app froze (Android showed "App isn't responding") during the run. |

   Reword `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` so they serve both platforms, for example "No device was configured for the script's platform." Their meaning doesn't change: `DEVICE_BUSY` says the device is in use, by another run or by another tool's UI-automation agent (a foreign agent). See [open point 3](#open-points-for-the-executor) for two further codes. These names become permanent once shipped, so they are owner decision E.

   **Keep iOS vendor codes as they are.** Today `failureOf` in `src/scripted/run.ts` passes any device-layer code that is also a bridge code straight through. The iOS `deviceError` golden run throws MobileBuildMCP's `APP_NOT_INSTALLED` and records `DEVICE_ERROR` with `vendorCode: "APP_NOT_INSTALLED"`. Adding `APP_NOT_INSTALLED` as a bridge code would silently change that. So scope the pass-through: MobileBuildMCP errors pass through only the 1.1 codes (freeze that set in code), and wrap everything else as `DEVICE_ERROR` plus `vendorCode`. The Android driver raises its new codes through its own path. Test that an iOS vendor `APP_NOT_INSTALLED` still reports `DEVICE_ERROR` with the vendor code, and that the `deviceError` golden entry stays byte-identical. Check each new name against MobileBuildMCP 2.7.1's codes too.
4. **The element and Jev's view.**
   - `Element` gains an optional `placeholder`, which only the Android driver sets. It also gains an internal "not selectable" marker ([open point 4](#open-points-for-the-executor)).
   - The renderer's Android branch uses the header `Current Android screen (full accessibility capture):` and the rule `android-full-text-v1`. It has the iOS field set (role, label, value, identifier, frame, state; state may carry `focused` and `selected`). When an element has a `placeholder`, the line shows `"placeholder": "<text>"` in place of `label`. The 24,000-byte budget is the same.
   - Password fields show their value as dots of the same length, never the characters, as on iOS. (This refines "Actions across Android versions" item 4, which said "only whether it has text".) The mapping (phase 4) writes the dots into `value`, so the renderer, selectors, `capture` and the shown value after typing all see dots. `Element` needs no password flag.
5. **Run log and reports.**
   - The `started` event records the platform's projection rule, and the run-log allowlist in `src/log/index.ts` accepts both rule names.
   - The Android app identity goes into `started` and `report.json` as new fields, **on Android runs only**, so iOS reports and `started` events don't change ([open point 5](#open-points-for-the-executor); owner decision C). `bundleId` is `null` on Android runs, which it can already be.
   - The shown value after typing is a contract addition in "Assemble the v1.2.0 spec" ([open point 11](#open-points-for-the-executor); owner decision D).
   - On Android runs only, the `prepared` event records the device identity, the serial, the device agent's SHA-256, and `sweptLeftovers: true` when the run took over a crashed run's lease and swept its agent and forward ([open point 5](#open-points-for-the-executor); decision G). These are fields, not new event types.
6. **Entry points.** The MCP `start_scenario` description says "an explicit iOS or Android action script". The CLI help names `JEV_ANDROID_DEVICE`. The server name stays `jev-ios-bridge` until 2.0.
7. **Until phase 4 lands,** the driver factory refuses an Android script with a clear "Android isn't available in this build" start error, so `main` never sends an Android script to the iOS driver. No release happens in between.
8. **Golden tests**, adding entries only:
   - accepted and rejected Android scripts with exact messages, including every rejected-field case above, and an iOS script that uses an Android field;
   - the new reason codes in `vocabulary.json`;
   - the `mcp.json` input-schema diff from item 1, and nothing else in that file;
   - `report.json` for an Android run, and the three iOS runs unchanged;
   - CLI exit codes for an Android script with no device (3). The test's environment helper must also delete `JEV_ANDROID_DEVICE`, or the result depends on the shell;
   - the Android renderer on hand-written elements, including a `placeholder` and a password field.
9. **Reference docs that tests check.** `tests/docs.test.ts` requires the reason-code reference to list exactly the bridge-owned codes, so update `docs/guide/reference/reason-codes.md` and `reference/script-format.md` in this PR. The full docs come in phase 7.

### Phase 4: the Android driver ([domain model](domain-model.md); [ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md); [mobilecli as a dependency](issues/01-mobilecli-as-a-dependency.md); [How Android elements map onto the bridge's elements](issues/02-android-element-mapping.md); [How a script names an Android app and device](issues/03-script-and-device-identity.md); [Actions across Android versions](issues/05-actions-across-android-versions.md); [Where Android plugs into the code](issues/07-where-android-plugs-into-the-code.md) items 2, 5, 6 and 8)

New code goes in `src/device/android/`: the driver, the agent supply, the device agent's client, the `adb` runner, the element mapping, the settle rule, and the preparation checks. The iOS driver stays in `src/device/index.ts`. The factory from phase 2 now builds this driver for Android scripts. The driver never runs mobilecli ([ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md)).

0. **The tracer comes first** (decision J). Before any other work in this phase, prove the design on both emulators, through the private adb server and following the device rules. Write it as a small script (`spikes/android/agent-tracer.mjs`, [open point 24](#open-points-for-the-executor)) and save its output under `spikes/benchmarks/results/v1.2.0/tracer/`. On `Medium_Phone_API_36.1` and on `jev-actions-api31`:
   - copy the agent out of the pinned package and check its SHA-256;
   - push it to the bridge's own path, start it, forward a port, and check that `device.version` returns the pinned SHA-256;
   - `device.dump.ui` returns the tree with `scrollable` and `password`, in the same shape as the captures;
   - a tap, `ctrl+a` then backspace, ASCII typing and `Tiếng Việt` through the clipboard, a swipe, and a screenshot all work;
   - the fence works: kill the agent, see it gone, remove the forward;
   - with mobilecli's own agent started through the guarded wrapper, the foreign-agent check ([open point 22](#open-points-for-the-executor)) sees it as foreign and leaves it running;
   - finally clean everything up, including mobilecli's private daemon.

   **If any step fails, stop and ask the owner:** ADR-0006 comes back to them, with mobilecli's CLI as the fallback.

1. **The pinned agent and the tools** (the agent-supply decision in the domain model).
   - Add `"mobilecli": "1.0.14"` (exact) to `dependencies`. Its optional platform packages bring the mobilecli program that holds the agent. Don't list the platform packages directly: that breaks `npm install` on Intel Macs.
   - `pinnedAgent()` resolves `@mobilenext/mobilecli-darwin-<arch>` from mobilecli's location and reads the program file. **It never runs it.** It finds the DEX file inside by its `dex\n0NN\0` header and requires exactly one whose length field, Adler-32 checksum and SHA-1 signature are valid. It then checks the file's SHA-256 against the pinned constant `0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f` (the same on both Mac builds).
   - It caches the file as `$TMPDIR/jev-android-agent/<sha256>.dex` (folder 0700, file 0600) and re-checks the cached file's hash on every run. Any failure is `ANDROID_TOOLS_UNAVAILABLE`.
   - Test with synthetic program bytes: one valid DEX, none, two, a bad checksum, a wrong SHA-256, and a tampered cache file.
   - Find `adb` as [open point 3](#open-points-for-the-executor) says. `adbEnvironment()` builds on `deviceEnvironment()`, which already strips `TYPESAFE_API_KEY`, and keeps `ANDROID_ADB_SERVER_PORT` so the private adb server is used. Test that.
   - The tools check runs before the device lookup, so a missing tool is reported first.
   - A test asserts that no runner is ever asked to execute the mobilecli program.
2. **Device identity and checks before a run** ("How a script names an Android app and device").
   - Resolve the device from `device.serial`, `device.avd` or `JEV_ANDROID_DEVICE`.
   - Resolve the **device identity**: an emulator's is its AVD name, `getprop ro.boot.qemu.avd_name` read over its serial; a phone's is its serial. Read that property only from `emulator-*` serials.
   - **Take the device lease right after resolving the identity** (phase 2's shared lease; [open point 7](#open-points-for-the-executor)), before anything that touches the device: waking it, force-stopping the app, or starting the device agent. `capture` does the same.
   - **Then check for agents** ([open point 22](#open-points-for-the-executor)):
     - a **foreign agent** (another tool's UI-automation program) means refusing with `DEVICE_BUSY`, without touching it;
     - after a takeover from a dead holder, sweep what its holder record lists, and only that: its `logcat` processes on the Mac (kill a pid only if its command line is still that run's `adb … logcat`), its device agent (only if it's still the bridge's own), and its forward;
     - any other bridge-owned agent (open point 22) is killed too: none can belong to a live run, because this run now holds the lease;
     - this serial's `localabstract:mobilecli-server` forwards are removed when no agent is left running.

     When the lease was taken over from a dead holder and anything was swept, `prepared` records `sweptLeftovers: true`.
   - Refuse, with the phase 3 codes, when the device isn't connected, is unauthorized, hasn't finished booting (`sys.boot_completed` isn't `1`), has its screen locked, or doesn't have the app installed. Also refuse when two running emulators share the AVD name.
   - Wake a screen that is only off. Never change a device setting (animations, permissions, stay-awake).
3. **Restart.** `am force-stop <package>`, then `adb shell am start -W` of `app.activity` or the launcher activity, with each extra passed as `--es <key> <value>`. Never clear app data. Quote every argument for the device shell ([open point 8](#open-points-for-the-executor)).
4. **The device agent** (its client is the anti-corruption layer to mobilecli's agent).
   - **Start it:**
     - push the cached agent to the bridge's own path, `/data/local/tmp/jev-ios-bridge-agent.dex`, never mobilecli's `/data/local/tmp/mobilecli.dex`;
     - start it with `adb -s <serial> shell "CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex nohup app_process / com.mobilenext.mobilecli.DeviceServer >/dev/null 2>&1 &"`;
     - take a free local port by binding `127.0.0.1:0`, then `adb -s <serial> forward tcp:<port> localabstract:mobilecli-server`, retrying up to 3 times on "cannot bind";
     - poll `device.version` every 100 ms for up to 5 s, until it returns the pinned SHA-256.

     This is what mobilecli 1.0.14 does (`devices/android_device_server.go:69-171`), without its `pkill` of every other agent. An agent that never answers is `DEVICE_ERROR` with `vendorCode` `agent`, unless a foreign agent is found then, which is `DEVICE_BUSY`.
   - **The client:**
     - HTTP/1.1 POST to `http://127.0.0.1:<port>/`, one JSON-RPC 2.0 request with an `id` per connection, `Content-Length` set, body under 1 MiB;
     - a JSON-RPC error becomes `DEVICE_ERROR` with `vendorCode` `agent`, and its message is never stored, because it can carry screen text;
     - a request that times out (10 s, or the dump's idle wait plus 10 s) is an **unknown** command in the lease's ledger, and is never re-sent.
   - **Reading the screen:** `device.dump.ui` with `{"waitUntilIdle": 2000}` ([`direct-dump.sh`](findings/05-assets/direct-dump.sh)). That tree keeps `scrollable` and `password`. It has the same shape as the captures' `dump ui --format raw` (the tracer confirms it), so one parser reads both.
   - **Screenshots:** `device.screenshot` ([open point 9](#open-points-for-the-executor)).
5. **Mapping.** Port `spikes/android/element-mapping.cjs` (prototype branch, commit `2366759`) into TypeScript, keeping its default options and dropping the prototype-only `note` and `source` fields. The rules are the Answer of "How Android elements map onto the bridge's elements". In short:
   - roles come from the class or from Compose's role-marker child;
   - a blank button takes its first inner text as its label, and that text stays in Jev's view but can't be selected;
   - system bars, invisible and zero-size nodes, and layout wrappers are dropped;
   - IDs are full resource-ids;
   - switches are `"1"`/`"0"`;
   - no new roles.

   Two additions from "Actions across Android versions" item 6 and "Where Android plugs into the code" item 6: any node with `scrollable: true` is a `scroll-view`, whatever its class, except that the text-field rule comes first (a multi-line `EditText` reports `scrollable` and must keep `typeText`); and a `password: true` field shows dots of its text's length, never the raw text (a classic field briefly shows its last character). `bridgeRole` stays MobileBuildMCP's translator.

   One correction to the prototype: **keep a text field's text exactly as the device reports it.** The prototype trims it (`element-mapping.cjs` line 95), which breaks three things. A value typed with a leading or trailing space would come back as a different string, so the run log's redactor, which masks exact values, would store it unmasked. The shown value would be wrong. And a field holding only spaces would count as empty and show its hint as a placeholder. So don't trim the field's text, and call a field empty only when its text is the empty string. Labels, hints and other text may stay trimmed. Test a typed value with a trailing space (the shown value keeps the space, and `run.jsonl` masks it), and a field holding only spaces (it has a `value`, not a `placeholder`). None of the 6 text fields in the 10 captures has text with spaces around it, so the golden files are unaffected.
6. **Actions** ("Actions across Android versions" items 1 to 7, sent as device agent calls instead of mobilecli commands). Every action targets an element of the latest settled snapshot, and a reference from an older snapshot is refused (the session invariant in the [domain model](domain-model.md#android-device-session)).
   - **Tap** the element's centre by coordinates, as whole numbers (`device.io.tap {x, y}`), from the settled snapshot the step just matched.
   - **Replace text:**
     - focus the field ([open point 10](#open-points-for-the-executor));
     - `device.io.keys` with `ctrl+a`, then a 0.2 s pause, then a separate `device.io.keys` with backspace ([open point 23](#open-points-for-the-executor) for the key format). Never send both keys in one call;
     - type the value. ASCII goes through `device.io.text {text}`. Anything else goes through `device.clipboard.set {text}`, then `device.io.button {"button": "KEYCODE_PASTE"}`, then `device.clipboard.clear`, as mobilecli does (`devices/android.go:976-987`).

     Typed values travel in a JSON body, so a leading `-` needs no escaping. Don't use `adb shell input`.
   - **After typing,** record the field's shown value from the settled capture ([open point 11](#open-points-for-the-executor)). Don't fail the step on a mismatch: formatting fields legitimately differ.
   - **Swipe** within the element's bounds along its centre line, from 90% to 10% of its length in the swipe's direction, over 1000 ms (`device.io.swipe {x1, y1, x2, y2, duration: 1000}`, whole numbers). "Up" means the finger moves up, as on iOS.
7. **The settle rule** (item 8). A capture is one `device.dump.ui` call. After every action, capture until two captures taken at least 250 ms apart match, with the status bar left out of the comparison. **Measure the 250 ms from when the earlier capture returned to when the later capture starts**, not between the two requests' starts. A capture waits up to about 0.6 s for the app to go idle and reads the tree at the end of that wait, so two requests started 610 ms apart can read trees only 30 ms apart. So: capture, wait until 250 ms after it returned, capture again, and compare. If they differ, the newer capture becomes the one to match. Cap it at 3 s. When the cap is hit, use the last capture and mark the step "screen still changing" ([open point 11](#open-points-for-the-executor)). `act` returns the settled capture, which the run then uses as its next observation (the `DeviceDriver` interface already allows this). Base `screenHash` on the same comparison. Test with a fake clock and a first capture that returns at 600 ms: the second capture must not start before 850 ms, nothing may settle earlier, and a matching second capture settles when it returns.
8. **`close`** keeps the device lease's invariant: when the lease is released, nothing the run started can still act on the device ([domain model](domain-model.md#device-lease), decision G). The run abandons a cancelled or timed-out driver call without waiting for it. It also **always** calls `close`, even after a failed `prepare` (`src/scripted/run.ts:349-354`). So `close` undoes only what this run actually did, and nothing else:
   - **The driver records what it started:** whether it restarted the app, the pid of the device agent it started, the forward port it created, and its `logcat` streams. The same list goes into the lease's holder record (phase 2), for a crash takeover.
   - **Once `close` begins, the driver issues no new device work.** Each step of a multi-step operation (preparing, starting the agent, replacing text) checks this first, so an abandoned operation stops at its next step.
   - **Tracking:** every finite `adb` command and every device agent request is tracked in the lease's ledger until it ends. The `logcat` streams aren't, because only `close` stops them, and stopping a local process is never an unknown device outcome.
   - **`close` works in this order,** tolerating "not running" at each step:
     1. **Wait, within `close`'s time limit, for every tracked `adb` command to exit,** including the one that starts the agent. A command still running at the limit, or whose outcome is unknown (killed, no exit status), keeps the lease: `close` fails with `UI_ACTION_UNCONFIRMED`, and the run ends inconclusive with `CLEANUP_FAILED`, as on iOS. When it exits later, finish the steps below and release the lease late.
     2. **Fence the bridge's own agent.** Kill only the agent process this run started, by its pid, after checking it's still the bridge's own ([open point 22](#open-points-for-the-executor)). Then confirm it's gone. Never `pkill` by class name, which would also kill a foreign agent. A confirmed fence ends every agent request, including one whose outcome was unknown. An unconfirmed fence keeps the lease in the same way.
     3. **Force-stop the app, but only if this run restarted it.** A run refused before its restart (`DEVICE_BUSY`, or the device checks) leaves the app alone. The app watch expects this stop.
     4. **Once phase 5 lands, stop this run's `logcat` streams** (SIGTERM, then SIGKILL after 1 s), and wait for them to exit.
     5. **Remove this run's forward**, by its port.
     6. **Release the lease.**

     The wait comes before the fence because a pending `adb` command, such as the one that starts the agent, could start an agent after an earlier fence. With the wait first, the fence is the last word on the agent. It still comes before the app stop, so no late tap lands after it. Leave the agent file on the device: it's inert. Any other failure in these steps keeps the lease and fails `close` (`CLEANUP_FAILED`).
   - The CLI's SIGINT and SIGTERM handlers close the service, which calls this same `close`; they don't replace it.

   Test with fakes:
   - the order and the tolerance;
   - a `DEVICE_BUSY` refusal followed by `close`: the foreign agent keeps running, the app isn't stopped, and the lease is released;
   - a cancel while the agent is starting: `close` waits for the start command, then fences the agent it started, and no agent is left;
   - after `close` begins, an abandoned `prepare` or replace-text issues no further device command;
   - a cancel during `am start -W` (the app is stopped only after the launch returns, never before);
   - an agent request that times out: the fence ends it and the lease is released, but when the fence can't be confirmed the lease stays;
   - a late `adb` exit after `close`'s limit (the lease is kept, then released when the command exits);
   - an `adb` command that never exits (the lease stays);
   - a failed cleanup step (the lease stays, and the run doesn't pass).
9. **Golden tests from the captures** ("Where Android plugs into the code" item 8; "Evidence plan and release gates" item 8).
   - Copy the 10 captures (`spikes/android/captures/*.json`, without the PNGs) and the 10 judged texts (`spikes/android/jev-check/observations/*.txt`) from the prototype branch at `2366759` into `tests/fixtures/android/`. The worktree is `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.worktrees/proto-android-mapping`. Name the source commit in the test file. Copy the files; don't merge the prototype branch.
   - For each screen, test three things: raw tree, then elements (a new golden file), then Jev's text. **The production renderer must emit each `observations/*.txt` byte for byte.** That text is exactly what Jev judged in "What Jev sees on Android, and the 10-screen check". `cmp-3-number-input.txt` is the version re-checked after the placeholder fix.
   - The captures come from `dump ui --format raw`, so they lack `scrollable` and `password`. Add small fixtures for those two flags from [`api36-lists-direct.json`](findings/05-assets/api36-lists-direct.json) and a hand-made password field.
   - Driver tests with fake runners cover:
     - device resolution and every refusal code, including a foreign agent (`DEVICE_BUSY`, and the foreign agent left running);
     - the sweep after a crash takeover (`sweptLeftovers: true`);
     - the restart commands;
     - replace text: the two separate key calls and the pause, a leading-dash value reaching `device.io.text` unchanged, and Vietnamese through the clipboard and paste;
     - swipe coordinates;
     - the settle rule: it settles, never early, and stops at the cap;
     - the agent's version check, and `close`;
     - a forward listing that holds two emulators' forwards;
     - a multi-line `EditText` that reports `scrollable`.

### Phase 5: the log pane and app-exit detection ([Log pane and app-exit detection on Android](issues/06-log-pane-and-app-exit.md); [Where Android plugs into the code](issues/07-where-android-plugs-into-the-code.md) item 7)

1. **The log stream.** In `prepare`, before `am start -W`, the driver:
   - finds the app's uid by an exact match on the package in the full `pm list packages -U` output (passing the name as a filter matches substrings);
   - reads the device time (`adb shell date +%s.%3N`);
   - starts one `adb logcat -v threadtime,year,uid --uid=<uid> -T <device time>` for the run. `-T` needs a time: a count returns nothing with `--uid`.

   The stream follows restarts by itself and keeps native crash dumps. It is written to an owner-only file (0600) in a private temp folder (0700), for example `$TMPDIR/jev-android-logs/`. Delete files there older than 3 days at the next run. Record the stream's pid, and the events stream's, in the lease's holder record (phase 2). `close` kills the stream and waits for it to exit (phase 4 item 8). It is never a tracked command, so `close` doesn't wait for it to end by itself.
2. **Into the pane.**
   - `logSources()` gains an optional `logcat` path.
   - `src/logpane/stream.ts` gains a logcat line parser, lifted from [`logcat-line.mjs`](findings/06-assets/logcat-line.mjs): `System.out` and `System.err` show as `[app]`, other tags as `[os] [Tag]`, levels `E`, `F` and `A` in red, `V` and `D` dim.
   - Show every line from the app's uid.
   - Per-step `logTails` and the `logs` command (and its after-the-run fallback, which then also lists the logcat file) work from the same file.
   - Where the pane and `BridgeService` pass `bundleId`, pass the app's identity instead: the bundle ID or the package.
3. **Masking** is the iOS rule, unchanged: script values show as `[value:<key>]` in the pane and `[REDACTED]` in `run.jsonl`. As on iOS, an upper-case copy of a value isn't masked.
4. **Is the app running?** A second small stream, `adb logcat -b events` filtered to `am_crash`, `am_anr`, `am_kill` and `am_proc_died` (plus `am_proc_start` if the watcher needs it), folds into a running/exited state. Start it from the same device time as the log stream (`-T`), read before `am start -W`: without it, logcat replays the buffer, and an old native crash, which is matched by package rather than pid, would mark a fresh launch as exited. The state keeps `appRunning()` synchronous. so `appRunning()` stays synchronous. Run `pidof` once, after `am start -W`, to learn the pid, and never earlier, because it blinks during a cold start. The bridge's own force-stops, at restart and in `close`, are expected, as `expectStop()` does on iOS. Match a native crash by package name plus `Native crash`, because its `am_crash` carries `system_server`'s pid. [`exit-watch.mjs`](findings/06-assets/exit-watch.mjs) is the prototype.
5. **The pane's "app stopped" check moves onto the driver.** Today it reads MobileBuildMCP's `_helperpid` from a file name. It now takes the driver's `appRunning`, on both platforms, in this same change.
6. **Reason codes.**
   - Java and native crashes (even with the "app has stopped" dialog still up), kills, exits, and force-stops the bridge didn't send are `APP_EXITED`.
   - A frozen app is `APP_NOT_RESPONDING`. The run needs to tell "not responding" apart from "exited", so the driver exposes that state beside `appRunning()`, for example an optional method that returns the cause. The interface isn't frozen.
   - Going to HOME isn't detected, as on iOS.
   - The pane note names the cause, for example "crashed: FATAL EXCEPTION on main", "native crash: SIGSEGV", "force-stopped by another process" or "exited".
7. **Tests** feed the recorded lines in [`findings/06-assets/captures/`](findings/06-assets/captures/) to the parser and the watcher. Copy the lines you use into `tests/fixtures/android/`, so tests don't depend on `.scratch`. The watcher must sort every captured run as the prototype did, must ignore a stale native crash placed before the run's start time, and `probe-anr` must give `APP_NOT_RESPONDING`. Update the iOS pane tests that read `_helperpid` to the new `appRunning` path. That test is the only `APP_NOT_RESPONDING` evidence: there's no live freeze run. Also test a normal `close` with both `logcat` streams still running: the streams are stopped, the lock is released, and the run can pass.

### Phase 6: the `capture` command, the `/test-android` skill, and the plugin ([The /test-android skill](issues/10-the-test-android-skill.md); [How a script names an Android app and device](issues/03-script-and-device-identity.md), "Default device")

1. **`jev-ios-bridge capture`**, for Android only in 1.2.
   - It picks the device with `--serial`, then `--avd`, then `JEV_ANDROID_DEVICE`, and runs the same checks before capturing.
   - It captures the current screen without launching or restarting the app. It holds the device lease while it does, checks for foreign agents as a run does, and cleans up afterwards as `close` does: it fences the device agent and removes the forward. It leaves the app alone.
   - It prints one JSON line per element (role, label, value, identifier, placeholder, state), with `"selectable": false` on lifted texts.
   - `--jev` prints Jev's text for the screen instead: the Android projection, byte for byte.
   - It needs no TypeSafe key. See [open point 12](#open-points-for-the-executor) for exit codes and settling.
   - Add it to the CLI help, with golden tests for its output on a fixture and for its exit codes.
2. **The skill:** a new, self-contained `skills/test-android/SKILL.md`. `/test-ios` is untouched.
   - It follows the same seven steps as `/test-ios`, with Android details, and calls `capture` instead of mobilecli.
   - When a capture shows Compose elements with no identifiers, it tells the user to add `Modifier.semantics { testTagsAsResourceId = true }` at the root composable (`androidMain`) and shows where. It doesn't edit or rebuild the app unless asked. Meanwhile it writes `role` plus `label` selectors.
   - Android notes, each linking to its guide page rather than repeating it:
     - `app.package`; `device.avd` for emulators and `device.serial` for phones; `app.activity` and `app.intentExtras` for a stable start screen;
     - `placeholder` on empty fields, so never claim a field "contains" it;
     - dots for password fields;
     - numbers quoted exactly as printed;
     - custom tabs and toggles need a selected or checked state;
     - non-English text types exactly, but Jev's promise covers English screens;
     - real phones are untested.
   - Its description triggers on verifying an Android app (Jetpack Compose, Compose Multiplatform or classic Views) on an emulator or phone.
   - Write it with `writing-for-agents`, then `unslop`.
3. **`scripts/build-plugin.mjs`** copies `skills/test-android/SKILL.md` into the plugin with the same kind of path rewrite as `/test-ios`, failing loudly when an expected string is missing ([open point 13](#open-points-for-the-executor)). The plugin ships it as `/jev-ios-bridge:test-android`.
4. **`plugin/plugin.json`:**
   - "Simulator UDID" becomes optional (`required: false`).
   - Add an optional "Android device" setting (a serial or an AVD name), passed to the server as `JEV_ANDROID_DEVICE`.
   - With either setting left empty, the server must start, so a user with only Android, or only iOS, can use the plugin. An empty `JEV_ANDROID_DEVICE` counts as unset. The MCP path already ignores an empty `JEV_DEVICE_UDID`; leave the iOS CLI's handling of it as it is. Test both.
   - Update `plugin/README.md` to match. See [open point 14](#open-points-for-the-executor) for the descriptions.

### Phase 7: docs, version, and CHANGELOG ([Assemble the v1.2.0 spec](issues/09-assemble-the-spec.md), "Guide pages"; the Answers named per item)

Shipped docs link only to files inside the tarball. Link anything outside it (ADR-0006, research, findings, example app sources) by its GitHub URL at the `v1.2.0` tag, as 1.0 did.

1. **A new Android setup page** ([open point 15](#open-points-for-the-executor) for its name). It covers:
   - what you need: the Android SDK's `adb`, Android 12 (API 31) or later, and on Apple Silicon an arm64 emulator image;
   - naming the device: `device.avd` for emulators, `device.serial` for phones, `JEV_ANDROID_DEVICE`, and the plugin's Android setting;
   - `testTagsAsResourceId`: apps without it have no identifiers at all, and where to set it;
   - custom Compose tabs and toggles must expose their selected or checked state;
   - turning animations off is optional and makes runs faster; the bridge never changes device settings;
   - `pm grant` for permission dialogs;
   - on Xiaomi phones, "USB debugging (Security settings)" for input;
   - the bridge runs its own copy of mobilecli's device agent, never mobilecli itself. Another UI tool holding the device (mobile-mcp, mobilecli, Appium, `uiautomator`) makes a run refuse with `DEVICE_BUSY`: close that tool first;
   - screen lock ([open point 16](#open-points-for-the-executor)).
2. **Quickstart** (`01-quickstart.md`): a new Android section that runs twin-fail on an emulator through `/test-android`, expecting **failed** on the $3 total. The iOS steps stay as they are.
3. **Claim writing** (`05-writing-claims.md`): quote numbers exactly as the app formats them (`2.500.000`, not `2,500,000`), and never claim that an empty field "contains" its hint.
4. **Troubleshooting** (`08-troubleshooting.md`): every new reason code; `adb logcat -b crash -d` and `adb shell dumpsys activity exit-info <package>` for crashes; "screen still changing"; `DEVICE_BUSY` from a foreign agent; and how to clear a leftover device agent or `adb forward` by hand (the next run sweeps the bridge's own).
5. **Limits** (`10-limits.md`):
   - going to HOME isn't detected;
   - an upper-case copy of a value isn't masked;
   - real Android phones are untested;
   - Jev's accuracy promise covers English screens, though non-English text types exactly;
   - Android 12 or later;
   - custom tabs without selection state give uncertain claims;
   - two emulators running the same AVD are refused;
   - Android runs were tried only on Apple silicon (the agent copy is checked on both Mac builds);
   - Android speed, with placeholders for phase 8's numbers.
6. **Data handling** (`09-data-handling.md`): the Android log file (owner-only, deleted after 3 days, not masked, the same as iOS); password fields shown as dots; intent extras recorded and not masked, like `launchArgs`; the bridge never runs mobilecli, so there's no telemetry, no cloud call and no read of other connected devices, and the device agent listens only on the device's own local socket.
7. **Reference:** `script-format.md` (every new field, per platform), `reason-codes.md` (the final wording), `report-json.md` (the new fields), and the `capture` command wherever the CLI is documented (`06-running.md`).
8. **Also:** `02-prepare-your-app.md` and `README.md` (the guide index) link the Android page; `11-stability.md` says what 1.2 added, including which parts of `capture` are stable (its flags, exit codes and named fields) and that its element lines may gain fields; `README.md` at the root mentions Android; `docs/architecture.md` gains `src/device/android/` and the shared device lease.
9. **`CHANGELOG.md`** for 1.2.0: Added (Android, the `capture` command, `/test-android`, the new codes and fields), Changed (reworded codes, optional simulator setting), and "Upgrading from 1.1": nothing to change for iOS scripts.
10. **Bump `package.json` to `1.2.0`** here, so that phase 8 checks the real candidate. Add `docs/releases/v1.2.0.md`, shaped like the v1.1.0 notes, with placeholders for phase 8's numbers.
11. **The evidence scripts** go in this PR, so they are part of the candidate: the six Android scripts that phase 8 runs, plus the Vietnamese variant of settings-search, as `"version": 1`, `"platform": "android"` scripts with the flows and expected verdicts in phase 8's table ([open point 17](#open-points-for-the-executor) for where they live and how they name the device). Write them against real `capture` output from the emulators, following the device rules. The quickstart's Android section uses twin-fail.

### Phase 8: release checks on the candidate ([Evidence plan and release gates for v1.2.0](issues/08-evidence-plan-and-release-gates.md))

**Before the checks:**

- Start the private adb server, and boot `Medium_Phone_API_36.1` and `jev-actions-api31` with `-no-snapshot-save`.
- Build and install the twin app (`examples/diagnostic-app-android`, package `dev.jevbridge.diagnostic`: `./gradlew :app:assembleDebug`, then `adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk`) and `cmp` (see the Rules) on both emulators. `cmp` goes on Android 12 only if it installs there; if it doesn't, record why and skip that run.
- Record a baseline of `pgrep -fl mobilecli` before the first Android run. The bridge must never add a mobilecli process.
- For the iOS regression, rebuild and reinstall Weather and the diagnostic app on the dedicated simulator, as the v1.0.0 spec's phase 7 did, if either is missing.
- Load the Jev key by path.

Run every check on the candidate merge commit (the last of phases 1 to 7). Put the evidence under `spikes/benchmarks/results/v1.2.0/`. **Blocking** checks must pass. **Report-only** checks are recorded, and a miss doesn't block.

| # | Check | Kind | How | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `npm run check` and CI | Blocking | Local run, plus CI on the merge commit || Pass: 566/566, CI on `ef3daa2` and `d0bc224`. [check-01.md](../../spikes/benchmarks/results/v1.2.0/check-01.md) |
| 2 | Golden tests | Blocking | Part of 1. Existing entries changed only as the Rules allow. The Android renderer emits the 10 judged texts byte for byte. `APP_NOT_RESPONDING` comes from the recorded event lines. || Pass (part of 1). [summary](../../spikes/benchmarks/results/v1.2.0/summary.md) |
| 3 | Android 16 scripts, **one run each** on `Medium_Phone_API_36.1` | Blocking | twin-fail (Add Apple and Bread, complete, claim `Total: $5`) → **failed**; twin-pass (`Selected: Apple, Bread`, `Order complete`) → **passed**; twin-ambiguous (a planted guard matching two elements) → **inconclusive**; cmp-number-input (replace text, type into the empty placeholder field, claim the formatted value) → **passed**; cmp-list-swipe (`swipeWithin` on the Compose million-row list, claim a later row is visible) → **passed**; settings-search (type into a classic field, open Display, claim Dark theme is off) → **passed** || Pass; settings-list-swipe stands in for cmp-list-swipe (owner, 2026-10-01). `check-03/` |
| 4 | Android 12 runs on `jev-actions-api31` | Blocking | twin-fail → **failed**; settings-search typing `Tiếng Việt`, checked by a guard (the non-English typing gate) → **passed**; cmp-number-input → **passed**, only if `cmp` installs on API 31 || Pass. `check-04/` |
| 5 | Crash run | Blocking | One manual twin-pass run with `adb shell am crash dev.jevbridge.diagnostic` sent partway through, in the owner's desktop session. Expect `APP_EXITED`, the crash in the log pane, and the pane closing cleanly. Save a `screencapture` of the pane. || Pass, rerun on the fixed code 2026-10-01. `check-05/` |
| 6 | Cleanup gate, **after every Android run** in checks 3 to 5, 9 to 10 and 14 to 15 | Blocking | For the run's emulator:<br>• no mobilecli process beyond the baseline;<br>• `adb -s <serial> shell pgrep -f com.mobilenext.mobilecli.DeviceServer` prints nothing;<br>• no `localabstract:mobilecli-server` line for that serial in `adb forward --list`;<br>• no lease file for that device identity in the lease folder;<br>• no `adb … logcat` process of that run left on the Mac.<br>Any leftover fails the release. Record each check. || Pass after every run. `*.cleanup.txt`, [check-09-10.md](../../spikes/benchmarks/results/v1.2.0/check-09-10.md) |
| 7 | iOS regression | Blocking | All tests pass (1). One run each, with the v0.1.0 harness `spikes/benchmarks/run-bridge.mjs` as 1.0 used it, of `spikes/benchmarks/scenarios/weather-scripted.json`, `contacts-scripted.json`, `reminders-scripted.json` and `examples/diagnostic-app/scenario.json`, on the dedicated simulator `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. Expected: Weather, Contacts and Reminders **passed** (Reminders' 0.90 count claim stays accepted as borderline), and the diagnostic app **failed** on its $3 total. || Pass; Reminders borderline at 0.89, accepted by the owner 2026-10-01. `check-07/` |
| 8 | Real phones | Blocking (docs only) | The release notes and the limits page say real Android phones are untested. Write the Xiaomi checklist at `spikes/benchmarks/results/v1.2.0/real-phones/xiaomi-checklist.md`: twin-fail, settings-search with Vietnamese, the Xiaomi input setting, and the cleanup check. Problems found later go into 1.2.1. **Don't run it.** || Pass (docs only). `real-phones/` |
| 9 | Plugin install, Android only | Blocking | A fresh install on this Mac with a throwaway `CLAUDE_CONFIG_DIR`, the Android device set and no simulator UDID ([open point 18](#open-points-for-the-executor)). The owner types the key (see the Rules). The MCP server starts, the pinned mobilecli package is present and its agent copies out with the pinned SHA-256, and the server sees `ANDROID_ADB_SERVER_PORT`. || Pass on the second attempt (PR #33 fixed the first). [check-09-10.md](../../spikes/benchmarks/results/v1.2.0/check-09-10.md) |
| 10 | Quickstart walkthrough | Blocking | Follow the quickstart's new Android section as written, through Claude Code and `/test-android`: twin-fail on the emulator gives **failed**, pointing at the $3 total. The `v1.2.0` tag doesn't exist yet, so use the candidate commit where the quickstart names the tag, and record it as a pre-tag deviation, as 1.0 did. || Pass (pre-tag deviation: `d0bc224`). [check-09-10.md](../../spikes/benchmarks/results/v1.2.0/check-09-10.md) |
| 11 | Tarball install | Blocking | `npm install <tgz>` into an empty project. Both entry points print `1.2.0`, the installed file list matches `files`, and `skills/test-android/SKILL.md` is there. `npx jev-ios-bridge capture --avd NoSuchAvd` (private adb server) exits 3 with `DEVICE_NOT_CONNECTED`. Because the tools check runs before the device lookup, this shows `adb` and the pinned agent resolved. || Pass. `check-11/` |
| 12 | Speed | Report-only | From checks 3 to 4: per-script durations, capture and settle times, and typing speed. There's no target. || Reported. [check-12-speed.md](../../spikes/benchmarks/results/v1.2.0/check-12-speed.md) |
| 13 | iOS log pane | Report-only | Phase 5 changed the pane's "app stopped" check on iOS too. Run the diagnostic app in check 7 with the pane on, and record what it showed. || Reported. `check-13/` |
| 14 | Foreign agent | Blocking | On `Medium_Phone_API_36.1`, start mobilecli's own agent through the guarded wrapper (one `dump ui`), then run twin-pass. Expect a `DEVICE_BUSY` refusal before the app is touched, and mobilecli's agent still running afterwards. Then clean it up by hand, including mobilecli's private daemon. || Pass. `check-14/` |
| 15 | Crash takeover | Blocking | Start twin-pass through the CLI and `kill -9` the bridge after its first action. Then run twin-pass again. Expect **passed**, with `sweptLeftovers: true` in `prepared`. The crashed run's two `adb … logcat` processes must be gone once the second run has prepared, not only when it ends, and the cleanup gate must be clean. || Pass, rerun on the fixed code 2026-10-01. `check-15/` |

There is no new Jev corpus: check 2's golden test stands in for it ("Evidence plan and release gates" item 8).

### Phase 9: release records, tag, and publish (as v1.1.0 was; [`plugin/README.md`](../../plugin/README.md), "Release")

1. **Release-records PR** (docs only):
   - write phase 8's numbers into the limits page and `docs/releases/v1.2.0.md`;
   - fix any guide step that check 10 found wrong;
   - fill in the checks table in this file;
   - run `npm run build:plugin`, and copy `build/plugin/marketplace.json` to `.claude-plugin/marketplace.json`.

   Re-run checks 1, 2 and 11 on the branch. **Ask the owner before merging.**
2. **Tag and publish,** only with the owner's approval, and back to back with the merge, because `marketplace.json` points at the asset URL.
   - Tag `v1.2.0` on the release-records merge commit.
   - Publish a **regular** GitHub release from `docs/releases/v1.2.0.md`.
   - Attach `jev-ios-bridge-1.2.0.tgz` and the exact `jev-ios-bridge-plugin-1.2.0.zip` whose SHA-256 is in `marketplace.json`. Zips aren't reproducible, so never rebuild it.
3. **Verify the published assets.**
   - Download the tarball fresh, check its SHA-256, install it cleanly, and confirm both entry points report `1.2.0`.
   - Install the plugin from the real marketplace with a throwaway `CLAUDE_CONFIG_DIR`, set up for Android only, and confirm the server starts.
   - Save the record as `spikes/benchmarks/results/v1.2.0/publication-verification.json`.

## Open points for the executor

The tickets leave these details open. Use the recommended default unless it turns out to be wrong, and say which you used in your report. If a default would contradict an Answer, stop and ask.

1. **What a mobilecli upgrade re-runs.** Default: copy the new version's agent out, pin its SHA-256, and check that its protocol still has every method the driver uses. Then run the contract tests and the six Android 16 scripts from check 3, one run each, with the cleanup gate.
2. **Which characters Android typed values allow.** Default: any Unicode text except control characters, still at most 2,048 characters and 32 values, and a leading `-` allowed. iOS keeps its rule and message.
3. **Two more refusal codes** (owner decision E). Default: add `DEVICE_UNSUPPORTED` for a device below Android 12 (API 31), whose `--uid`, `ctrl+a` and agent paths were never checked; and `ANDROID_TOOLS_UNAVAILABLE` when `adb` can't be found, or the pinned mobilecli package is missing, or the agent copied out of it doesn't match the pinned SHA-256. Find `adb` through `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then `PATH`, then `~/Library/Android/sdk/platform-tools/adb`. Other device agent and `adb` failures become `DEVICE_ERROR` with `vendorCode` `agent` or `adb`. Never store their messages: they can carry screen text.
4. **How "can't be selected" is marked.** Default: an internal `selectable?: false` on `Element`, honoured by `src/scripted/select.ts` and never shown to Jev. The same name appears in `capture`'s output.
5. **New `report.json` fields** (owner decision C). Default: on Android runs only, `platform: "android"`, `package`, `activity` (or `null`) and `intentExtras` (`{}` when none), also recorded in the `started` event. iOS reports carry none of them, so a reader treats a report without `platform` as iOS. The `prepared` event records the device identity, the serial, the device agent's SHA-256, and `sweptLeftovers: true` after a crash takeover, and the prose report names them. `report.json` doesn't.
6. **Void** (decision G). It had moved to owner decision B, one mobilecli home per run, but the bridge no longer runs mobilecli.
7. **The lease key.** "Where Android plugs into the code" says "keyed by serial or AVD name". Default: key the device lease by the device identity (the AVD name for an emulator, the serial for a phone), so a script that names `emulator-5554` and one that names its AVD share one lease.
8. **Quoting intent extras.** `adb shell` joins its arguments into one device-shell command. Default: single-quote every argument for the device shell, and test with a value holding spaces, quotes, `&`, `;` and `%`.
9. **Screenshots.** Default: `device.screenshot` with `{"format": "jpeg", "maxSize": 800}` (the iOS size), decoded from base64. One per observation, taken on the settled snapshot and saved as `screen-N.jpg`.
10. **Focusing the field before replace text.** The device agent types only into the focused field. Default: tap the field's centre first, then clear and type.
11. **Where "shown value" and "screen still changing" go** (owner decision D). Ticket 09 lists the shown value as a contract addition, and `report.json` has no per-step list today. Default:
    - the `action` event records `shownValue`, and the `step` event records `settled: false` when the cap was hit, both through the run log's redactor as usual;
    - `report.json` on Android runs gains an optional `typedFields` array, one `{ "stepId", "shownValue" }` per replace-text step, built from those events;
    - the prose report shows both;
    - a password field's shown value is the mapping's dots, never raw text.
12. **`capture`'s exit codes and settling** (owner decision E). Default: exit 0 when it printed, and 3 when it couldn't capture, with the reason code and a plain message on stderr. It applies the settle rule before printing, so it shows what a run would see. No screenshot.
13. **The skill's path rewrites.** Default: the skill uses `npx jev-ios-bridge capture` and `node_modules/jev-ios-bridge/docs/guide/`, and the plugin copy rewrites them to `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture` and `${CLAUDE_PLUGIN_ROOT}/docs/guide/`. The skill passes `--avd` or `--serial` explicitly, taken from the script or asked of the user, because a shell started by Claude Code doesn't get the plugin's `JEV_ANDROID_DEVICE`.
14. **Descriptions that say "iOS".** Default: update the descriptions and keywords in `package.json`, `plugin/plugin.json` and the marketplace entry in `build-plugin.mjs` to say iOS and Android. Names stay.
15. **The setup page's name.** Default: `docs/guide/12-android-setup.md`, so existing page numbers and links don't move.
16. **A swipe-only lock screen.** Default: after waking the screen, a keyguard that is still showing is `DEVICE_LOCKED`. Dismissing it would change the device. The setup page tells users to set Screen lock to None on a test device.
17. **Evidence scripts.** Default: `examples/diagnostic-app-android/scenario.json` holds twin-fail (the quickstart uses it). The other scripts go in `spikes/benchmarks/scenarios/android-*.json`, with a separate `android-settings-search-vi.json` for the Vietnamese run. None names a device. Set `JEV_ANDROID_DEVICE` to the AVD name for each run, so one script runs on both emulators.
18. **Installing the plugin before it is published.** Default: in phase 8, install from the local build (a local marketplace pointing at the built zip, or `claude --plugin-dir`), passing the Android device with `--config` (never the key). Phase 9 repeats the install from the real release.
19. **The settle rule on the first capture after launch.** An activity switch can give a blank capture. Default: apply the settle rule after `am start -W` too, not only after actions.
20. **Device name patterns.** Default: `device.serial` matches `^[A-Za-z0-9._:-]{1,100}$` (network serials carry a `:`), and `device.avd` matches `^[A-Za-z0-9._-]{1,100}$`. `JEV_ANDROID_DEVICE` must match one of them, and a value that `adb devices` lists as a serial is a serial; otherwise it's an AVD name. Anything else is `INVALID_DEVICE`, with golden cases.
21. **Void** (decision G). It was about hiding paired iPhones from mobilecli, which the bridge no longer runs.
22. **Recognising agents on the device.** Default:
    - after taking the lease, list processes with `adb -s <serial> shell ps -A -o PID,NAME,ARGS`;
    - the bridge's own agent is an `app_process` running `com.mobilenext.mobilecli.DeviceServer` whose `/proc/<pid>/environ` has `CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex`;
    - any other process running `com.mobilenext.mobilecli.DeviceServer`, `UiDumpServer`, `com.mobilenext.devicekit`, `uiautomator`, or an Appium UiAutomator2 instrumentation (`io.appium.uiautomator2`) is foreign.

    The tracer confirms that `/proc/<pid>/environ` is readable from `adb shell` on API 31 and 36. If it isn't, stop and ask.
23. **The key format for `ctrl+a` and backspace.** Default: send exactly what mobilecli 1.0.14 sends for `io keys ctrl+a` and `io keys backspace` (`devices/android.go:861-940`: `KEYCODE_CTRL_LEFT` as the modifier of `KEYCODE_A`, and `KEYCODE_DEL`), confirmed in the tracer.
24. **Where the tracer lives.** Default: `spikes/android/agent-tracer.mjs`, run with the private adb server, with its output under `spikes/benchmarks/results/v1.2.0/tracer/`. It is evidence, not product code, and the product's own tests don't depend on it.

## Decisions the owner accepted

**Accepted by the owner on 2026-09-29:** all six decisions below as written, and the recommended defaults for all 21 open points above. The executor still reports which defaults it used, and stops to ask if one would contradict an Answer.

The fresh-agent review ([`spec-review.md`](spec-review.md)) found points where the spec must go beyond, or slightly against, a ticket's words. Accepting the spec accepts these. Say so if you want otherwise.

- **A. The MCP input schema grows** (phase 3 item 1). Ticket 08 item 5 says golden files change only for reworded descriptions, but Android scripts can't validate unless `bundleId` leaves `required` and the ASCII pattern leaves `values` in `mcp.json`. ADR-0005 allows it: the schema accepts more and rejects nothing it accepted before.
- **B. One mobilecli home per run, not per process.** **Void** (decision G): the bridge no longer runs mobilecli, so there's no home to scope.
- **C. New report fields only on Android runs** (open point 5), so iOS reports stay byte-identical.
- **D. The shown value after typing goes into `report.json`** as `typedFields` on Android runs (open point 11).
- **E. Names that become permanent in 1.x:** the seven phase 3 codes, `DEVICE_UNSUPPORTED` and `ANDROID_TOOLS_UNAVAILABLE` (open point 3), and `capture`'s exit codes (open point 12).
- **F. A gate for Android's view** (in ADR-0006): a later change to `android-full-text-v1` or the Jev model re-runs the 10-screen check and needs zero confidently wrong answers.

**Accepted by the owner in the domain-model session on 2026-09-29** ([`domain-model.md`](domain-model.md#decisions)):

- **G. The bridge drives mobilecli's device agent directly, and never runs mobilecli** ([ADR-0006](../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md)).
  - The agent is copied out of the pinned program and checked against a pinned SHA-256.
  - A foreign agent means `DEVICE_BUSY`, and the bridge kills only its own agent.
  - The device lease is released only when nothing the run started can still act on the device. Stopping the agent, confirmed, is the fence.
  - A crashed run's lease goes to the next run, which sweeps only the bridge's own leftovers.
  - The new `prepared` fields are the agent's SHA-256 and `sweptLeftovers`.
  - **Voided:** decision B, open points 6 and 21, ticket 01's daemon and home rules, and the network guards. Where the Answers of "mobilecli as a dependency", "How a script names an Android app and device" and "Actions across Android versions" describe mobilecli's CLI or daemon, the domain model wins, and each of those tickets carries a comment.
- **H. iOS moves that change no contract:** `bridgeRole` into the iOS driver, and the app's identity instead of `bundleId` inside the code (phase 2 items 5 and 6). The device lease becomes one shared module (phase 2 item 2).
- **I. A checkpoint on a screen that never settled is judged as usual,** and its step is marked "screen still changing".
- **J. The tracer gates the Android driver** (phase 4 item 0). If starting the copied agent or recognising a foreign agent fails on an emulator, ADR-0006 comes back to the owner.

## What the executor reports back

- the filled checks table, with a link to each piece of evidence, and every cleanup-gate result;
- the PR list;
- the release URL, the SHA-256 of both assets, and the fresh-download and fresh-install results;
- every stop-and-ask event and the owner's answer;
- for each open point, the default used, or what you did instead and why;
- the path of the Xiaomi checklist;
- the tracer's result on both emulators.

Unsuccessful attempts stay in the record. Never describe an inconclusive or failed attempt as a pass.

## Out of scope for this release

- One script for both platforms: each script targets one platform.
- Android runs in CI or on headless emulator farms.
- Building, installing or seeding apps, as on iOS.
- Renaming the package: that waits for 2.0.
- BFSOne as evidence, and any use of the Xiaomi or another phone before the owner frees it.
- New roles such as `checkbox` or `radio`; typed intent extras; a paste-typing option.
- A new Jev corpus, and a speed target.
- A freeze button in the twin app.
- Asking mobilecli upstream to keep the dropped flags (a later, optional step).
- Gemini's vision-action loop (a model choosing taps from screenshots, with open device tools for the host agent): it reverses ADR-0001 and ADR-0003, so it's a separate effort if ever wanted.
- `capture` for iOS, and any change to `/test-ios`.
