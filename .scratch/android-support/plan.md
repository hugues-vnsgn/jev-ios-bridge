# Android support: research and plan

Researched 2026-09-28 on this Mac: an arm64 emulator (`emulator-5554`, Android 16, API 36) and a Xiaomi Poco X3 Pro (`2985e9c`, Android 12, MIUI 13) over USB. Only read-only commands went to either device: UI dumps, screenshots, `getprop`, `pm list packages`, and one no-op key event on the Xiaomi to check input permission.

## Owner decisions (2026-09-28)

- **Device layer: an existing tool, not our own adb code**, the way ADR-0002 made MobileBuildMCP the iOS layer. The candidate is mobile-mcp's engine, mobilecli; see "Existing MCP check" below.
- **Script shape:** a top-level `"platform": "android"`, with `app.package`, `device.serial` and optional `app.intentExtras`. iOS scripts don't change.
- **Name:** keep `jev-ios-bridge` through 1.x, add a `/test-android` skill, and rename at 2.0.
- **Jev check:** about 10 Android screens, one run.

## Existing MCP check (2026-09-28)

mobile-mcp (`@mobilenext/mobile-mcp` 1.0.5, Apache-2.0) is the only maintained MCP that drives Android emulators and phones. It bundles mobilecli 1.0.13, a Go CLI that returns JSON. The bridge would call mobilecli directly (`mobilecli dump ui`, `io tap`, `io swipe`, `io text`, `screenshot`, `apps launch`), the same way it calls the MobileBuildMCP CLI today. It wouldn't go through the MCP server. One read-only probe per mode:

| | Emulator (Android 16, permission dialog on screen) | Xiaomi (Android 12, BFSOne open) |
| --- | --- | --- |
| mobile-mcp, legacy adb mode | failed 3/3: "Cannot read properties of undefined (reading 'node')", 0.4–1.1 s | lists it as an "emulator" |
| mobilecli (default mode) | failed 3/3 after 11 s: "no XML content found in uiautomator dump" (cause found later: a leftover Google helper; see the spike) | **worked**: 6.1 s cold, 0.8–1.2 s warm, 48 nodes |
| raw `uiautomator dump` (for comparison) | worked, 13 nodes | 2.8–2.9 s |

- **What fits:** a nested tree with refs (`@e1`), `type` (Android class), `text`, `label` (content-desc), `identifier` (resource-id) and `rect`, plus tap by ref. States (`focused`, `selected`, `checked`, disabled) appear only when not at their default. It installs no agent on Android ("no agent needed for android devices"), and it's faster than raw adb on the Xiaomi.
- **What's missing, so the bridge adds it over adb:** replacing a field's text (mobilecli only types into the focused field), starting the app with intent extras, streaming logs (`mobile_get_device_logs` is a bounded capture), and checking whether the app is running.
- **Risks:**
  - It failed on the emulator screen that raw adb could read. That was one screen, a system dialog, so the spike must re-test on normal app screens.
  - Emulators have different IDs in the two modes: the AVD name in mobilecli, `emulator-5554` in adb.
  - mobilecli's GitHub licence is FSL-1.1 with an Apache-2.0 future licence (`docs/research/physical-iphone-device-layer.md:178`), even though its npm wrapper says MIT. It is source-available, not open source. It's fine to use, but it's a dependency that forbids building a competing product with it.
- **Fallback:** if the spike fails on the emulator, use raw adb in a thin driver, modelled on mobile-mcp's legacy `android.ts`.

## Emulator spike (2026-09-28)

The owner asked for emulator-only testing, with no BFSOne, because another agent is using the Xiaomi. The test app is `examples/diagnostic-app-android`, a Jetpack Compose twin of the iOS diagnostic app with the same IDs and the same planted $3 total. It uses the Compose Multiplatform artifacts (1.11.1) and sets `testTagsAsResourceId` at the root.

- **The earlier emulator failures were our fault, not mobilecli's.** The research agent's `android layout` run left Google's helper server (`com.android.cli.interact.instrumentation`) running from 17:21. Android allows only one UI automation connection at a time, so every dump from any tool failed. After `am force-stop` of that helper, mobilecli worked.
- **The full flow works through mobilecli:** Add Apple, Add Bread, Complete order, then the confirmation screen, which reads "Total: $3".
  - Capture: 0.4–0.8 s warm (1.6 s the first time).
  - Tap by coordinates: about 0.1 s.
- **`mobilecli dump ui --format raw` is the capture to use.** It has class, text, hint, content-desc, resource-id, focused, enabled, checked, checkable, clickable, selected, visible and rect. The default JSON format drops clickable, and mobile-mcp's own list drops even more.
  - `testTag` arrives as resource-id (`choose.apple`, `selection.summary`, `order.complete`).
  - A Compose Button is a clickable, textless `android.view.View` with its text on a child `TextView`. The bridge must lift that text onto the button.
  - A disabled button reads `enabled: false`.
  - Status-bar elements are mixed in. Their resource-ids start with `com.android.systemui:`, so the bridge can filter on that prefix.
- **Typing:** `io text` typed `Wi-Fi & 50% "off"` exactly, but slowly (4.8 s for 17 characters). A text field's `hint` stays separate from its `text`. Replacing text worked with `input keycombination 113 29` (Ctrl+A) then `KEYCODE_DEL`, then `io text`. `keycombination` needs API 33+, so the Android 12 Xiaomi needs another select-all.
- **Logs:** `mobilecli device logs --device <id> --filter key=value` streams without end, so it can feed the log pane.
- **mobilecli leaves two things running:**
  - A daemon on the Mac (`~/.mobilecli/daemon.sock`). `mobilecli daemon stop` ends it.
  - `app_process … com.mobilenext.mobilecli.DeviceServer` on the device, from files it pushes (`/data/local/tmp/mobilecli.dex`, `mobilecli.so`). This survives `daemon stop`, and it blocks every other UI automation tool (raw `uiautomator dump` gets "Killed") until `adb shell pkill -f com.mobilenext.mobilecli.DeviceServer`. The driver's `close` must kill it; otherwise the bridge breaks the next tool or agent to use the device.
- **Not yet done:** the Jev check on about 10 Android screens, the Xiaomi (it's busy), select-all on API < 33, and screens that keep animating.

## Answer

- **MobileBuildMCP won't help.** 2.7.1 has no Android code, and its repo, changelog and issues show no plan for it. Android needs its own device layer behind the existing `DeviceDriver` seam (`src/contracts/index.ts:59`).
- **Use mobilecli (from mobile-mcp) as the Android device layer**, pinned like MobileBuildMCP, with a few raw adb calls for what it lacks. Raw adb alone is the fallback.
- **Real phones come almost free.** On iOS a real iPhone needs WebDriverAgent and per-developer signing. On Android the emulator and the phone use the same `adb` commands. The extra work is setup checks: authorization, screen awake, and Xiaomi's input permission.
- **Size: M.** The driver is about 300–500 lines, plus the Compose text merge, log pane, contract additions, docs, and one Jev accuracy check on Android screens.

## Findings

### Candidates

| Option | Tree | Actions | Device install | Licence | Verdict |
| --- | --- | --- | --- | --- | --- |
| **raw adb** (`uiautomator dump`, `input`, `screencap`, `logcat`) | XML: class, text, resource-id, content-desc, bounds, checked/enabled/focused/selected/password | tap, swipe, key, ASCII text | none | n/a | Fallback |
| Appium UiAutomator2 (driver 8.7.0, server 10.6.6) | Richest (hint, error, heading, input-type), tunable idle wait | W3C actions, setText | 2 APKs + instrumentation server | Apache-2.0 | Too heavy |
| mobile-mcp / mobilecli | adb (mobile-mcp) or its own Java agent (mobilecli) | yes | none on Android (checked) | mobile-mcp Apache-2.0; mobilecli FSL | **Pick** (owner wants an existing tool) |
| Maestro 2.10.0 | gRPC on device | yes | 2 APKs | Apache-2.0 | JVM-only library, reports of flaky gRPC |
| Google Android CLI 1.0 (`android layout`) | JSON, but no checked/enabled/selected | none | instrumentation server | Google | Failed on the Xiaomi; no input |

### Speed

| Step | iOS (MobileBuildMCP, direct) | Android emulator | Xiaomi |
| --- | --- | --- | --- |
| UI capture | ~0.5 s | 0.35–0.4 s warm; 2.2–3.9 s on a screen with a permission dialog open | 2.8–2.9 s |
| Screenshot | ~0.45 s device work | 0.5–1.2 s | 0.5–0.9 s |

The Xiaomi's ~3 s per capture is the main speed risk. A 20-step script would spend about a minute just capturing.

### What the driver has to handle

- **Compose's tree is unmerged.** A Compose button appears as a clickable, textless `android.view.View` with its label on a child `TextView`. The driver must pull child text up into the nearest clickable ancestor. Otherwise selectors like `{ role: button, label: "Save" }` won't match, and Jev sees a different structure than on iOS.
- **`testTag` is invisible by default.** It becomes `resource-id` only with `semantics { testTagsAsResourceId = true }`, and that setter exists only in `androidMain`. BFSOne (`com.beelogistics.openfreightone.android`) uses `testTag` in 31 files but never sets it, so its current dumps have no identifiers.
- **Dump failures.** "could not get idle state" on screens that keep animating, "null root node", and on MIUI a Java stack trace printed before `<?xml`. Needs a retry, a strip-before-`<?xml`, and turning animations off.
- **Typing.** `input text` is ASCII-only and needs `%s` for spaces and escaping for shell characters. That matches the current US-keyboard limit on iOS, so nothing is lost. Replacing text needs select-all then delete (`input keycombination` on API 33+, a delete loop on older versions).
- **App restart.** `am force-stop`, then `am start -W` or `monkey -p <pkg> -c android.intent.category.LAUNCHER 1`. Android has no launch arguments; the closest thing is intent extras.
- **Logs.** `logcat --pid=$(pidof -s <pkg>)`. The PID changes on every restart, so the stream re-attaches. The log pane follows files today (`src/logpane/stream.ts`), so it needs a process source.
- **Real devices.** "unauthorized" until the RSA prompt is accepted; a locked or dark screen breaks everything; FLAG_SECURE screens give black screenshots (the tree still works). Xiaomi needs "USB debugging (Security settings)" for input, which the Poco already has (`persist.security.adbinput=1`).
- **Emulators.** Only arm64 images on Apple Silicon. Boot is done when `sys.boot_completed` is `1`. Animations are on (`window_animation_scale` 1.0) until set to 0.
- **System dialogs.** The emulator is sitting on BFSOne's notification-permission dialog now. Scripts must guard for it, or setup must grant the permission (`pm grant`).

### Contract impact (ADR-0005)

All of it can be added in 1.x; nothing frozen has to change.

- **Script:** new optional fields only. iOS scripts stay valid.
- **Roles:** Android classes map onto the existing roles (Button→button, EditText→text-field, TextView→text, ImageView→image, Switch→switch, SeekBar→slider, RecyclerView/ScrollView→scroll-view). Additions such as `checkbox` or `radio` are allowed.
- **Reason codes:** add codes for Android-specific stops, such as an unauthorized device or missing input permission. `NO_DEVICE` and `INVALID_DEVICE` mention simulators in their wording, which the guide can widen.
- **Projection:** the observation says "Current iOS screen". Android needs its own projection rule, and ADR-0004 makes a Jev accuracy check on Android screens a condition for claiming support.

## Plan

Each milestone is one PR.

1. **Spike (throwaway, `spikes/android/`).** Map `mobilecli dump ui` output to `Element`, including the Compose text merge. Run it on BFSOne on both devices, with `testTagsAsResourceId` set in a debug build and the emulator's permission dialog dismissed. Try tap, replace text (select-all over adb, then `io text`) and swipe. Send 3–5 real checkpoints to Jev. **Done when** selectors resolve on both devices and Jev answers confidently. If mobilecli keeps failing on the emulator, switch to raw adb.
2. **ADR-0006 and contract additions.** Record the mobilecli choice, its FSL licence, and the adb calls around it. Add the script fields, roles, reason codes, an Android projection rule, and extend the golden tests without changing existing entries.
3. **`AndroidDriver`** (mobilecli plus adb). Implements `prepare` (lock by serial; check authorized, booted, awake and unlocked; force-stop and start), `observe` (dump and screenshot concurrently, with retries), `act` (tap the centre of bounds, replace text, swipe within bounds), `close`, and `appRunning` via `pidof`. Unit tests use a fake `adb` runner, like `CliRunner` for MobileBuildMCP today.
4. **Log pane from logcat.** Add a process line source beside the file follower.
5. **Entry points.** A CLI env var for the serial, optional plugin config, MCP tool description, and a `/test-android` skill, or widen `/test-ios`.
6. **Docs and evidence.** Guide pages for Android setup (`testTagsAsResourceId`, animations off, Xiaomi setting, `pm grant`), updated limits, one run each of a few scripts on the emulator and the Xiaomi, and the Jev accuracy check.
7. **Release v1.2.0.**

## Not in scope

Building, installing, or seeding the app (the same as iOS); non-ASCII typing, which needs a helper app on the device; one script that runs on both platforms; CI or headless emulator farms.
