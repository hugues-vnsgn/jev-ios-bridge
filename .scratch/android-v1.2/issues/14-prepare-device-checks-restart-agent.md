# Phase 4: prepare (device identity, the lease, agent checks, device checks, restart, the agent)

Status: ready-for-agent
Blocked by: 10, 11

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) items 2, 3 and 4 ("Start it"), with their part of item 9, and open points [7, 8, 16 and 22](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full, and the [domain model](../../android-support/domain-model.md)'s device lease and Android device session. The detail below only adds acceptance criteria.

## What to build

The Android driver (`src/device/android/`), implementing `DeviceDriver`, with `prepare` and `preparation()`. It takes the injected `adb` runner and agent client from Issue 11, a clock, a screenshot folder and a lease root, as the iOS driver takes `CliRunner` and `lockRoot`. `observe`, `act` and `close` come in Issues 15 and 16: leave them throwing "not built yet", and don't wire the driver into the factory.

`prepare` works in this order. Every finite `adb` command and agent request runs inside the lease's ledger (Issue 11's helper).

1. **Tools check** (Issue 10), before anything else.
2. **Device name to serial and device identity** (item 2). The name comes from `selectAndroidDeviceName` (phase 3). Read `adb devices -l`: a serial must be listed and in state `device` (`unauthorized` is `DEVICE_UNAUTHORIZED`; missing or `offline` is `DEVICE_NOT_CONNECTED`). An AVD name matches the running emulators whose `getprop ro.boot.qemu.avd_name` equals it; none is `DEVICE_NOT_CONNECTED`, two are `DEVICE_AMBIGUOUS`. Read that property only from `emulator-*` serials. The identity is the AVD name for an emulator, the serial for a phone.
3. **Take the device lease** on the identity (open point 7), before anything that touches the device. A live holder is `DEVICE_BUSY` with the lease's existing message.
4. **Agent check and sweep** (open point 22): list processes with `ps -A -o PID,NAME,ARGS`; read `/proc/<pid>/environ` for each candidate.
   - A foreign agent means `DEVICE_BUSY`, and it is left untouched.
   - After a takeover from a dead holder, sweep what its holder record lists, and only that. `prepared` then records `sweptLeftovers: true`.
   - Any other bridge-owned agent is killed by pid.
   - This serial's `localabstract:mobilecli-server` forwards are removed when no agent is left running.
   - Never `pkill` by class name.
5. **Device checks:** below API 31 is `DEVICE_UNSUPPORTED`; `sys.boot_completed` not `1` is `DEVICE_NOT_BOOTED`; the package not installed is `APP_NOT_INSTALLED`. Wake a screen that is only off with `input keyevent KEYCODE_WAKEUP`; a keyguard still showing after that is `DEVICE_LOCKED` (open point 16). Never change a device setting.
6. **Restart** (item 3): `am force-stop <package>`, then `am start -W` of `app.activity` (relative or fully qualified) or the launcher activity, with each extra passed as `--es <key> <value>`. Single-quote every argument for the device shell (open point 8). Never clear app data. Record that this run restarted the app.
7. **Start the agent** (item 4, "Start it"):
   - push Issue 10's cached agent to `/data/local/tmp/jev-ios-bridge-agent.dex`, never mobilecli's path;
   - start it with `CLASSPATH=… nohup app_process / com.mobilenext.mobilecli.DeviceServer >/dev/null 2>&1 &`;
   - bind `127.0.0.1:0` for a free port, then `forward tcp:<port> localabstract:mobilecli-server`, retrying up to 3 times on "cannot bind";
   - poll `device.version` every 100 ms for up to 5 s until it returns the pinned SHA-256;
   - find the agent's pid and confirm it is the bridge's own.
   - Record the pid and the forward port as owned processes in the lease's holder record, so a crash takeover can sweep them.
   - An agent that never answers is `DEVICE_ERROR` with `vendorCode` `agent`, unless a foreign agent is found then, which is `DEVICE_BUSY`.
8. **`preparation()`** returns the device identity, the serial, the agent's SHA-256, and `sweptLeftovers` when it applies.

Once `close` begins (Issue 16 sets the flag), no step issues new device work: each step checks it first.

**Also in this Issue** (coordinator, 2026-09-30, from Issue 11's report):
- **`vendorCode` reaches the evidence.** `failureOf` in `src/scripted/run.ts` returns only `{ code }` for a `DeviceReasonError`, so the `vendorCode` that Issue 11's errors carry (`agent`, `adb`) never reaches `run.jsonl` or `report.json`. Pass an optional `vendorCode` through for a `DeviceReasonError` that carries one, with the same pattern check the `DeviceCliError` branch uses, and test it with `runScriptedScenario`: a driver throwing `DEVICE_ERROR` with `vendorCode` `agent` records it in the `error` event and in `report.json`. iOS errors carry none, so iOS output doesn't change.
- **Use the merged building blocks:** `androidTools()` and `pinnedAgent()` (Issue 10; never pass its test-only `pinnedSha256`), `adbRunner()`, `inLedger()` and `deviceAgentClient()` (Issue 11), the settle rule's `Clock` type (Issue 13).

## Fixtures from real devices

Record the `adb` outputs the fakes replay, once, from `jev-actions-api31` and `Medium_Phone_API_36.1`, into `tests/fixtures/android/adb/`: `devices -l`, the `getprop` values used, `ps -A -o PID,NAME,ARGS` with and without an agent, `forward --list` (including one holding two emulators' forwards), `pm path`, the launcher lookup you choose, `am start -W`, and the screen and keyguard state (off, on, locked) from the `dumpsys` command you choose. Follow the release spec's device rules exactly: the private adb server on port 5099, the `adb devices` check before each command, `-no-snapshot-save`, one emulator at a time, and shutting down what you started. Never touch port 5037 or a phone. Don't run mobilecli. Take a foreign agent's `ps` and `environ` lines from `spikes/benchmarks/results/v1.2.0/tracer/*.jsonl`.

While recording, also capture one `device.dump.ui` of an empty classic `EditText` and of an empty classic password field, and check what they report as `text` (Issue 12 saw uiautomator report the hint as the text; the tracer saw the agent report `""` for the Settings search field). Save them as fixtures, and tell the coordinator if the agent reports the hint, because the mapping would then need a fix. Starting the agent to take them is allowed; kill it by pid afterwards, per the device rules.

## Acceptance

- Driver tests with a fake `adb` runner and agent client cover: device resolution by serial and by AVD name, and every refusal code above; a foreign agent (`DEVICE_BUSY`, no kill or forward removal issued for it, the app not touched); the sweep after a crash takeover (only the listed pid and forward, `sweptLeftovers: true`); the restart commands with an extra holding spaces, quotes, `&`, `;` and `%`; the agent push path, start command, forward retry, and version check; and a forward listing that holds two emulators' forwards.
- The lease is taken before the first command that touches the device; a test pins the order.
- No command in any test calls the mobilecli program or `pkill`.
- `npm run check` passes. The fixtures are real outputs, named by API level.
