# Phase 4 tracer: results (2026-09-30)

The tracer (`spikes/android/agent-tracer.mjs`) is the release spec's phase 4 item 0 (decision J). It proves ADR-0006's device layer on both emulators before any driver code is written. **Both pass, 19 of 19 steps each.** ADR-0006 stands.

| Step | `jev-actions-api31` (API 31) | `Medium_Phone_API_36.1` (API 36) |
|---|---|---|
| Copy the agent out of `mobilecli-darwin-arm64@1.0.14` (read, never run): exactly one valid DEX, 72,660 bytes, format `038`, pinned SHA-256 | pass | pass |
| Cache it under `$TMPDIR/jev-android-agent/<sha256>.dex` and re-check the hash | pass | pass |
| Push to `/data/local/tmp/jev-ios-bridge-agent.dex`, start with `app_process`, forward a free port, `device.version` returns the pinned SHA-256 | pass, ready in 521 ms | pass, ready in 411 ms |
| Recognise the agent as the bridge's own by `CLASSPATH` in `/proc/<pid>/environ` (open point 22: readable from `adb shell`) | pass | pass |
| `device.dump.ui {"waitUntilIdle": 2000}`: every node has every key the prototype's capture has, of the same type, plus `scrollable` and `password` (and `focusable`, `long-clickable`, `index`, `package`) | pass, 191 nodes | pass, 184 nodes |
| Swipe up within the scrollable list, 90% to 10% of its height, 1000 ms: the screen changes | pass | pass |
| Tap the Settings search bar's centre: the search field opens | pass | pass |
| `device.io.text` of `-5 a"b'c&d; e%`: shown exactly | pass | pass |
| `ctrl+a` (`KEYCODE_A` with `KEYCODE_CTRL_LEFT`), a 0.2 s pause, then a separate `KEYCODE_DEL`: the field is empty (open point 23) | pass | pass |
| `Tiếng Việt` through `device.clipboard.set`, `KEYCODE_PASTE`, `device.clipboard.clear`: shown exactly, clipboard empty after | pass | pass |
| `device.screenshot {"format": "jpeg", "maxSize": 800}`: a JPEG | pass | pass |
| The fence: kill the agent by its pid, see `/proc/<pid>` gone, it no longer answers, remove the forward | pass | pass |
| mobilecli's own agent, started through the guarded wrapper: seen as foreign (`CLASSPATH=/data/local/tmp/mobilecli.dex`), verdict `DEVICE_BUSY`, left running | pass | pass |
| Clean up: `mobilecli daemon stop`, kill only the agents the tracer started, remove forwards and pushed files; no agent, forward or mobilecli process left | pass | pass |

Files: `<avd>.jsonl` (one line per step, with its details) and `<avd>-screenshot.jpg` (the Settings search screen after the typing steps).

## How it was run

- A private adb server on port 5099 (`adb -P 5099 --one-device NO_SUCH_USB_DEVICE start-server`); the tracer refuses to run if that server lists anything but an emulator. The default adb server, which holds the Xiaomi `2985e9c`, never saw the emulators and was not touched.
- One emulator at a time, headless, with `-no-snapshot-save`, so neither quickboot snapshot changed. Both emulators were off before and were shut down after.
- mobilecli 1.0.14 was installed with `--ignore-scripts` into a throwaway folder, and ran only for the foreign-agent step, with a private `MOBILECLI_HOME`, `--insecure-storage`, a dead fleet URL and no usbmuxd.
- Settings is the test app (its search field is a classic `EditText`), so nothing was installed on the emulators.
- The agent's method parameters were read from mobilecli's source at `03be42d` (`agents/android/java/DeviceServer.java`, `devices/android.go`, `devices/android_device_server.go`).

## Found along the way

- **The keyboard keeps pasted text.** After `device.clipboard.clear`, the agent's `device.clipboard.get` returns `""`, but Gboard still offers `Tiếng Việt` as a clipboard suggestion on both versions (see the screenshots), and Android shows "Settings Services pasted from your clipboard". So a non-ASCII typed value can outlive the run in the keyboard's clipboard history. This is for the owner to decide before phase 4 item 6 is built; the tracer itself passes.
- **mobilecli clears differently.** mobilecli 1.0.14 clears the clipboard after a paste by setting it to `""`; the spec's `device.clipboard.clear` also works.
