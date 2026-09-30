# Troubleshooting

Find the run's `reason` (in the report, or `report.json`'s `reason`) below. The full list with one-line meanings is in [reason codes](reference/reason-codes.md).

## The script didn't reach the screen it expected

**`GUARD_MISSING`**: a `present` selector matched nothing visible.
- Compare the step's screenshot with your guard. The app may have opened on a different screen, or a popup may cover it. On Android, a permission dialog is a common cause: grant it ahead ([Android setup](12-android-setup.md#permission-dialogs-grant-ahead-with-pm-grant)).
- A label may differ slightly (curly quotes, trailing punctuation, a space inside). Take a fresh capture ([how](03-identifiers.md#see-what-the-bridge-sees)) and copy the exact text.
- An element scrolled out of view doesn't count: scroll first.
- On Android, a text marked `"selectable": false` in `capture` never matches. Select its button instead.
- **"Screen still changing"** in the report means that step's screen didn't settle within 3 seconds, so the step used the last capture it took. The capture may show a screen mid-animation. Wait for a settled element with a `wait` step, or turn animations off on the device ([Android setup](12-android-setup.md#animations-off-is-optional)).

**`GUARD_AMBIGUOUS`**: a `present` selector matched more than one visible element.
- Most often in Compose: a button's label also appears on its text child. Add `role` or use `identifier`.
- Repeated component tags (the same tag on every instance) need a `value`, or per-instance tags.

**`GUARD_FORBIDDEN`**: an `absent` selector matched something visible, typically a sheet or dialog that's still open.

**`WAIT_TIMEOUT`**: the `until` guard didn't hold within `timeoutMs`. Check the last screenshot. The wait's own `guard` must hold at every capture, so use an anchor that stays on screen the whole time.

## The action had no single target

**`TARGET_MISSING`**: nothing matched. **`TARGET_UNAVAILABLE`**: something matched but was hidden, disabled, or doesn't support the action (a tag on a wrapper can't be typed into). **`TARGET_AMBIGUOUS`**: several usable elements matched.

Fix the selector: use the acting element's identifier, add `role`, or narrow with `value`.

## Jev couldn't decide

**`ASSERTION_UNCERTAIN`**: a claim scored between 0.1 and 0.9. Reword it to name printed text, or add a step that brings the evidence on screen. See [write claims](05-writing-claims.md#when-a-claim-comes-back-uncertain). Don't just re-run it.

**`ASSERTION_FALSE`** means **failed**, not a problem: Jev found the claim confidently false. Check the screenshot. If the app is right and the claim is wrong, fix the claim.

## The app or the device

**`APP_EXITED`**: the app died mid-run. Look for a crash report in `~/Library/Logs/DiagnosticReports/`, and check the log pane. Compose Multiplatform before 1.12.1 can crash inside accessibility (`AccessibilityElement.<get-node>`) when screens are captured while dialogs open and close; upgrade.

On Android, the log pane names the cause (a crash, a native crash, a kill). To see the crash itself, and why the process ended:

```sh
adb -s <serial> logcat -b crash -d
adb -s <serial> shell dumpsys activity exit-info <package>
```

Going to the home screen isn't an exit, so it isn't detected.

**`APP_NOT_RESPONDING`** (Android): the app froze, and Android showed "App isn't responding". Something blocked its main thread. The crash commands above show the ANR.

**`DEVICE_BUSY`**: another bridge process holds the device's lease. The message names it. See [cancelling and the device lease](06-running.md#cancelling-and-the-device-lease).

On Android it also means that another tool's UI-automation agent (a foreign agent) holds the device: mobile-mcp, mobilecli, Appium, or `uiautomator`. Close that tool, then run again. The bridge never stops a foreign agent. If the tool has exited but its agent still runs, stop it by hand, as below.

**`NO_DEVICE` or `INVALID_DEVICE`**: for iOS, set a simulator UUID (`JEV_DEVICE_UDID`, the script's `device.udid`, or `.mobilebuildmcp/config.yaml`). Aliases like `booted` aren't accepted. For Android, set the script's `device.avd` or `device.serial`, or `JEV_ANDROID_DEVICE` ([Android setup](12-android-setup.md#name-the-device)).

**`DEVICE_ERROR`**: MobileBuildMCP reported an error the bridge doesn't have its own code for. `report.json`'s `error.vendorCode` holds MobileBuildMCP's code. Common causes: the simulator isn't booted, or the app isn't installed. A shut-down simulator can make MobileBuildMCP say an installed app is missing. On Android, `vendorCode` is `adb` or `agent`, naming the part that failed. The bridge never records that part's own message, because it can carry screen text. Check that the device is still connected, then run again.

**`UI_ACTION_UNCONFIRMED`**: a device command never answered, so the device lease was kept to protect the device. It's released when the command answers, or when that bridge process exits.

**`CLEANUP_FAILED`**: stopping the app didn't finish. Check that the simulator is still responsive. On Android, the message says whether the device lease was kept; the next run clears it once the bridge process that held it has exited.

## Android devices

These stop a run before the app starts, and `capture` exits 3 with them. [Android setup](12-android-setup.md) has the details.

**`ANDROID_TOOLS_UNAVAILABLE`**: `adb` wasn't found, or the pinned mobilecli package is missing, or the device agent copied out of it doesn't match the pinned SHA-256. Install the Android SDK platform tools, or set `ANDROID_HOME`. For the package, install the bridge again, so its pinned dependency is back.

**`DEVICE_NOT_CONNECTED`**: `adb devices` doesn't list the named serial, or lists it offline, or no running emulator has the named AVD. Start the emulator, or reconnect the phone, and check `adb devices`. An AVD name is case-sensitive.

**`DEVICE_AMBIGUOUS`**: two or more running emulators have the named AVD. Shut one down, or name one by serial.

**`DEVICE_UNAUTHORIZED`**: the device hasn't accepted this Mac's USB-debugging key. Unlock it and accept the prompt.

**`DEVICE_NOT_BOOTED`**: the device hasn't finished booting. Wait, then run again.

**`DEVICE_LOCKED`**: the lock screen is showing. Set Screen lock to None on a test device.

**`DEVICE_UNSUPPORTED`**: the device runs Android 11 or older. The bridge needs Android 12 (API 31) or later.

**`APP_NOT_INSTALLED`**: the script's `app.package` isn't installed on that device. Check the package name (`applicationId` in `build.gradle.kts`), then `adb -s <serial> install -r <apk>`.

### Clearing a leftover device agent or forward by hand

After each run, the bridge stops its device agent and removes its `adb forward`. After a crash, **the next run clears the bridge's own leftovers,** so you don't need to. Clear them by hand only when you want the device for another tool before that.

1. Find the agent's process ID:

   ```sh
   adb -s <serial> shell ps -A -o PID,NAME,ARGS | grep com.mobilenext.mobilecli.DeviceServer
   ```

2. Check that it's the bridge's. The bridge's own agent has `CLASSPATH=/data/local/tmp/jev-ios-bridge-agent.dex`; any other is a foreign agent:

   ```sh
   adb -s <serial> shell cat /proc/<pid>/environ | tr '\0' '\n' | grep CLASSPATH
   ```

3. Stop it: `adb -s <serial> shell kill <pid>`.
4. Find the forward: `adb forward --list` shows it as `<serial> tcp:<port> localabstract:mobilecli-server`. Another tool's forward looks the same, so remove only the one you know is the bridge's: `adb -s <serial> forward --remove tcp:<port>`.

Don't use `pkill -f com.mobilenext.mobilecli.DeviceServer`: it also stops a foreign agent. A lock file for a process that has exited is cleared by the next run, so leave it.

## TypeSafe

**`AUTH`**: TypeSafe rejected the API key, or it's missing. Check `TYPESAFE_API_KEY` and your TypeSafe account. A short-lived 403 can clear on its own.

**`RATE_LIMIT`, `SERVICE`, `NETWORK`, `TIMEOUT`**: TypeSafe was unavailable or slow. Run again later.

**`STATE_BUDGET`, `REQUEST_BUDGET`**: the checkpoint screen has too much text to judge (about 24 KB). Check a screen with less on it, or scroll so less is visible.

## Limits and control

**`STEP_LIMIT`, `WALL_LIMIT`**: the run hit `--max-steps` or `--timeout-ms`. **`CANCELLED`**: someone cancelled it. **`INTERRUPTED`**: the bridge process stopped before recording a verdict. That run's evidence is kept, but it proves nothing.
