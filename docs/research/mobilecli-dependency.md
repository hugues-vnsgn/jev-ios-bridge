# mobilecli as a dependency: pinning, shipping, telemetry, and lifecycle

Researched: 2026-09-28 · Sources:

- **mobilecli**, `github.com/mobile-next/mobilecli`, cloned at `03be42d` (tag and GitHub release 1.0.14, 2026-09-27): the Go source, `LICENSE`, `CHANGELOG.md`, `publish/` (the npm packages) and `.github/workflows/build.yml` (how they are published). `git log` on `LICENSE` and `publish/npm/package.json` for the licence history. `gh release list` for the release dates.
- **mobile-mcp**, `github.com/mobile-next/mobile-mcp`, cloned at `18d0e8c` (npm `@mobilenext/mobile-mcp` 1.0.5, 2026-09-23): `src/server.ts`, `src/mobilecli.ts`, `README.md`, `LICENSE`.
- **go-ios** v1.0.211 (`github.com/danielpaulus/go-ios`, the version in mobilecli's `go.mod:9`), for how mobilecli reaches iPhones.
- **npm registry**, from `npm view` and `npm pack` on 2026-09-28: `mobilecli` 1.0.14, `@mobilenext/mobilecli-darwin-arm64` 1.0.14, `@mobilenext/mobilecli` 0.1.64, `@mobilenext/mobile-mcp` 1.0.5, `mobilewright` 0.0.60 and `@mobilewright/driver-mobilecli` 0.0.60.
- **This repo**: `src/device/index.ts` (`deviceEnvironment`, `pinnedMobileBuildMcpCli`, `defaultRunner`), `scripts/build-plugin.mjs`, `plugin/README.md`, `docs/adr/0002-mobilebuildmcp-as-device-layer.md`, `.scratch/android-support/plan.md` (the spike).

Citation keys (paths are at the commits above):

| Key | Repository | Link form |
| --- | --- | --- |
| `MC:` | mobilecli | `https://github.com/mobile-next/mobilecli/blob/03be42d/<path>#L<line>` |
| `MM:` | mobile-mcp | `https://github.com/mobile-next/mobile-mcp/blob/18d0e8c/<path>#L<line>` |
| `GI:` | go-ios | `https://github.com/danielpaulus/go-ios/blob/v1.0.211/<path>#L<line>` |

A line starting `$` is a command run on this Mac on 2026-09-28. Every mobilecli command ran against the emulator only, through three guards:

- a private adb server on port 5099 started with `--one-device NO_SUCH_USB_DEVICE`, so it attached no USB phone;
- an `adb` shim that logged every call mobilecli made and refused any `-s` other than `emulator-5554` (it never had to refuse one);
- `USBMUXD_SOCKET_ADDRESS` pointed at a dead socket, so no paired iPhone was queried.

The emulator (`Medium_Phone_API_36.1`, Android 16) wasn't running, so I booted it headless with `-no-snapshot-save` and shut it down afterwards. Nothing was installed, and no setting was changed. The Xiaomi `2985e9c` was never addressed.

## Answer

1. **Distribution:** depend on the unscoped **`mobilecli` at exactly `1.0.14`**. Don't use `@mobilenext/mobilecli`, which is the abandoned name (last release 0.1.64 in April). Don't use mobile-mcp either: it's an MCP server with PostHog and Scarf telemetry, and it pulls in Playwright. Resolve the platform binary from the wrapper's location and run it directly, never through the wrapper's `index.js`, which doesn't forward SIGTERM. `npm ci --ignore-scripts` keeps the binary executable (mode 755 in the tarball, no install scripts; tested). mobilecli has shipped 12 releases in 5 weeks, so upgrades have to be deliberate.
2. **Licence:** from 1.0.12 on, the binary, the wrapper and the repo all say **FSL-1.1-ALv2**. The "MIT" label was an npm packaging error: every npm release up to 1.0.11 carried it, and PR #427 fixed it. Before 2026-05-24 the repo was AGPL-3.0. Each release becomes Apache-2.0 two years after it ships, so 1.0.14 converts on 2026-09-27, 2028.
3. **Network:** mobilecli has **no telemetry and no crash reporting**. Its only cloud path is the "remote devices" fleet (`wss://api.mobilenext.ai/ws`), and that path runs only when a login token exists. But every invocation reads the macOS keychain for that token, and every first device lookup enumerates *all* Android phones, paired iPhones and simulators on the Mac. Turn these off with `--insecure-storage` and a private empty `XDG_CONFIG_HOME` (no keychain read, no token), and set `MOBILECLI_FLEET_URL` to an unreachable local address as a second guard.
4. **Lifecycle:** any device command starts a detached host daemon. It idles out after 30 minutes and is replaced by any client of another version. The on-device `DeviceServer` runs until killed or the device reboots: `daemon stop` leaves it and its `adb forward` in place. The driver must run each bridge process on a private `MOBILECLI_HOME`, and its `close` must stop the daemon, kill the `DeviceServer`, and remove the forward (the dex file is optional to remove).
5. **Device IDs:** mobilecli names an emulator by `getprop ro.boot.qemu.avd_name`, so it has a stable ID across port changes, and names a real phone by its adb serial. It rejects `emulator-5554` as "device not found". Translate by running that `getprop` on the serial yourself. The mapping is not unique when two emulators run the same AVD.
6. **Output contract:** stdout carries `{"status":"ok"|"error","data"?,"error"?}`, errors are repeated on stderr, and **every failure exits 1**. Flag-parse errors print no envelope. `dump ui --format raw` returns `data.rawData` as a *string*: JSON from the `DeviceServer`, or uiautomator XML when it falls back. Logs are one JSON object per line. All seven commands the bridge needs work on the emulator.

## Findings

### 1. Distribution and pinning

**Three npm names exist; one is right.**

| Package | Latest | Licence field | What it is |
| --- | --- | --- | --- |
| `mobilecli` | 1.0.14 (2026-09-27) | FSL-1.1-ALv2 | The current wrapper: `index.js` plus six exact-version `optionalDependencies`, one per platform |
| `@mobilenext/mobilecli-darwin-arm64` | 1.0.14 | FSL-1.1-ALv2 | The Mach-O binary and a `package.json`, `os: darwin`, `cpu: arm64` |
| `@mobilenext/mobilecli` | 0.1.64 (2026-04-02) | MIT | The old name. PR #191 "move npm package from @mobilenext/mobilecli to mobilecli" (2026-04-13) ended it |
| `@mobilenext/mobile-mcp` | 1.0.5 (2026-09-23) | Apache-2.0 | An MCP server. It reaches mobilecli through `mobilewright` 0.0.60 → `@mobilewright/driver-mobilecli` → `mobilecli` **1.0.13**, and pulls in `playwright` 1.63.0 |

- The publish job builds each binary with `go build -ldflags="-s -w"` (`MC:.github/workflows/build.yml:196`). It copies the binary into the platform package, runs `chmod +x`, and publishes with `--provenance`. Then it sets the wrapper's `optionalDependencies` to the same tag (`build.yml:444-466`). `npm view mobilecli@1.0.14 dist.attestations` shows an SLSA v1 provenance.
- `$ npm pack` shows `-rwxr-xr-x package/mobilecli-darwin-arm64` (15.0 MB) and no install scripts in either package. So the plugin's `npm ci --ignore-scripts` keeps it executable, as it does for MobileBuildMCP's AXe.
- `$ npm install --package-lock-only` then `$ npm ci --ignore-scripts` under `/tmp`: the lockfile records all six platform packages as `optional` with integrity hashes, and npm installs only `darwin-arm64`. The binary runs (`mobilecli version 1.0.14`). `codesign -dv` reports `Signature=adhoc`, linker-signed, with no Developer ID. npm sets no quarantine flag, so Gatekeeper doesn't stop it.
- Neither tarball contains `LICENSE`, only the `license` field. The plugin doesn't redistribute the package (Claude Code installs it from the registry), so the ADR only needs to link the licence.

**Don't run the wrapper.** `publish/npm/index.js` spawns the binary and exits when it closes (`MC:publish/npm/index.js:64-78`), but it forwards no signals.

- `$ node node_modules/mobilecli/index.js device logs …`, then `kill -TERM <node pid>`: the Go process was re-parented to PID 1 and kept streaming, with its `adb logcat` still running.
- The bridge aborts child processes with `AbortSignal` (`src/device/index.ts`, `defaultRunner`). Through the wrapper, every abort would orphan a mobilecli process.
- Sent straight to the binary, SIGTERM cancels the daemon call cleanly (`MC:cli/context.go:12-15`). `$` A streaming `device logs` killed with SIGTERM exited 0, and its logcat was gone.

mobile-mcp makes the same choice: it looks up `node_modules/@mobilenext/mobilecli-<os>-<arch>/<binary>` and runs it directly, with a `MOBILECLI_PATH` override (`MM:src/mobilecli.ts:110-154`).

**Recommendation.**

- Add `"mobilecli": "1.0.14"` (exact) to `dependencies`. Don't list platform packages directly: a plain dependency on `-darwin-arm64` would fail `npm install` on an Intel Mac with EBADPLATFORM.
- Resolve the binary beside `pinnedMobileBuildMcpCli()`, and run it with `execFile(binary, args)`, not `process.execPath`. Tested under `/tmp`:

  ```ts
  /** The pinned mobilecli binary for this Mac, run directly (its npm wrapper doesn't forward signals). */
  export function pinnedMobilecli(): string {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const wrapper = createRequire(import.meta.url).resolve('mobilecli/package.json');
    return createRequire(wrapper).resolve(`@mobilenext/mobilecli-darwin-${arch}/mobilecli-darwin-${arch}`);
  }
  ```

- Check `mobilecli --version` once per run against the pin. `--version` prints `mobilecli version 1.0.14`, the same check mobile-mcp makes (`MM:src/mobilecli.ts:157-168`).
- The plugin build needs no change for the binary. It copies `package-lock.json` and Claude Code runs `npm ci --ignore-scripts` (`scripts/build-plugin.mjs`, `plugin/README.md`). If a `/test-android` skill tells people to run mobilecli by hand, `build-plugin.mjs` needs a path rewrite like its `npx mobilebuildmcp` one.

**Release cadence.** GitHub releases 1.0.3 to 1.0.14 all came out between 2026-08-24 and 2026-09-27, about 2.4 a week (`$ gh release list`). The Android architecture is weeks old:

- 1.0.8 (2026-09-06) introduced the daemon and the embedded Android agent (`MC:CHANGELOG.md:48,54`);
- 1.0.11 (2026-09-16) moved tap, swipe and text onto that agent (`:26`);
- 1.0.12 and 1.0.13 fixed Android launch, dump and install races (`:7-24`).

Pin exactly, upgrade on purpose, and re-run the emulator evidence on every bump, as ADR-0002 does for MobileBuildMCP.

### 2. Licence

- `MC:LICENSE:1-3` reads "Functional Source License, Version 1.1, ALv2 Future License, Copyright 2025-2026 Mobile Next HQ, Inc.".
  - The "Permitted Purpose" is anything except a "Competing Use": making the software available in a commercial product or service that substitutes for it or for Mobile Next's products using it, or "offers the same or substantially similar functionality" (`:15-21`).
  - Redistribution must keep the terms or a link to them (`:34-36`).
  - "An additional Apache License, Version 2.0 becomes effective on the second anniversary of the Software's initial availability" (`:46-47`).
- **Licence history**, from `git log` on `LICENSE`:
  - AGPL-3.0 from the initial import (`88cf9fe`, 2025-06-09);
  - replaced by FSL-1.1-ALv2 in `8d34877` (2026-05-24).
- **Where the "MIT" came from**, from `git log` on `publish/`:
  - The wrapper's `package.json` said `"license": "MIT"` from the initial import until `96bfebd` (2026-09-16), "fix: set npm package license to FSL-1.1-ALv2 (#427)". That commit also changed all six platform packages. The release notes for 1.0.12 say "npm package license was set incorrectly, see LICENSE" (`MC:CHANGELOG.md:16`).
  - `$ npm view mobilecli@1.0.11 license` still says `MIT`. From 1.0.12 on, it and `@mobilenext/mobilecli-darwin-arm64@1.0.14` say `FSL-1.1-ALv2`.
  - The old `@mobilenext/mobilecli` still says MIT. It's frozen at 0.1.64, which is why earlier notes saw "npm wrapper: MIT".
- The Android agent (`agents/android/*.java`, and the `mobilecli.dex` built from it) is embedded in the binary (`MC:agents/agents.go:5`), so the same licence covers it.
- mobile-mcp is Apache-2.0 (`MM:LICENSE`), but the bridge wouldn't use it.
- **For the ADR:** the dependency is `mobilecli@1.0.14`, licensed FSL-1.1-ALv2 (source-available), converting to Apache-2.0 on 2028-09-27. The bridge uses it as a tool for its own purpose, which is permitted. A hosted "run your app on devices" service built on it could count as a Competing Use.

### 3. Network, telemetry and cloud calls

**No telemetry.**

- mobilecli's `go.mod` has no analytics or crash-reporting library (`MC:go.mod:7-21`). A search of the Go source for telemetry, PostHog, Sentry and analytics finds nothing.
- Every outbound URL in the source is one of these:

| Destination | When | Source |
| --- | --- | --- |
| `wss://api.mobilenext.ai/ws` (fleet RPC), and its HTTPS REST twin | only with a token: `FindDevice` appends remote devices when `GetFleetToken()` is non-empty | `MC:rpc/rpc.go:43-50`, `rpc/rest.go:19-24`, `commands/commands.go:74-92,141-142` |
| `https://app.mobilenext.ai/login/…` | `mobilecli auth login` only | `MC:cli/auth.go:26-27`, `cli/auth_oauth.go:26-28` |
| `github.com/mobile-next/devicekit-ios/releases/download/…` | `agent install` on iOS only | `MC:commands/agent.go:232,245` |
| `mobilenexthq-artifacts.s3.us-west-2.amazonaws.com` | remote-device uploads and downloads only | `MC:devices/remote.go:24` |

- `$ lsof -i` on the running daemon after dumps, taps, a launch and a log stream showed no internet sockets. The only sockets were the unix socket and short-lived loopback connections to the adb forward.

**The "no remote token: not logged in" line.**

- Every command's `PersistentPreRunE` calls `getRemoteToken()`, and the daemon does the same at start (`MC:cli/root.go:216-225`, `cli/daemon.go:95-99`).
- `loadToken()` checks `MOBILECLI_TOKEN`, then either the plaintext file `$XDG_CONFIG_HOME/mobilecli/credentials` (with `--insecure-storage`) or the macOS keychain item `mobilecli`/`mobilenext.ai` (`MC:cli/credentials.go:72-90`, `cli/auth.go:22-23`). The keychain read has a 3 s cap (`credentials.go:92-110`; `CHANGELOG.md:35`).
- When nothing is found, the verbose log prints "no remote token: not logged in, run 'mobilecli auth login' first" (`MC:cli/remote.go:14-24`), and no network call follows.
- So a developer who once ran `mobilecli auth login`, or who uses mobile-mcp's remote devices, has a keychain token. The bridge would then contact `api.mobilenext.ai` on every device lookup that misses the cache.

**Local reach beyond the chosen device.**

- The first `--device` lookup in a daemon calls `GetAllControllableDevices(true)` (`MC:commands/commands.go:122-150`). That covers:
  - `adb devices`, then for **every** Android device `getprop ro.boot.qemu.avd_name`, `ro.product.model` and `ro.build.version.release`. Real phones also get `settings get global device_name` (`MC:devices/android.go:590-700`).
  - go-ios `ListDevices` plus lockdown info for every paired iPhone (`MC:devices/ios.go:165-194`).
  - `simctl` for simulators, and the AVD `.ini` files (`MC:devices/common.go:264-340`).
- Lookups that fail aren't cached. `$` A dump with `--device emulator-5554` re-ran the `adb devices` and `getprop` round, then failed.
- Only `MOBILECLI_REMOTE_ONLY` skips local enumeration entirely (`MC:devices/common.go:269-271`), and that disables local devices too.
- So in normal use, a bridge run on the emulator also sends read-only commands to any phone on USB. This matters for the "don't touch the other device" rule in the map's Notes.

**Recommendation: `mobilecliEnvironment()`**, built on `deviceEnvironment()` (which already strips `TYPESAFE_API_KEY`):

| Setting | Effect |
| --- | --- |
| global flag `--insecure-storage` on every call | no keychain read; the token comes only from the credentials file (`MC:cli/credentials.go:77-79`). The auto-started daemon inherits the flag (`MC:cli/client.go:24-33`) |
| `XDG_CONFIG_HOME=<empty private dir>` | that credentials file never exists, so there's no token and no fleet call |
| `MOBILECLI_TOKEN` removed from the environment | a stray token can't turn the fleet on |
| `MOBILECLI_FLEET_URL=ws://127.0.0.1:9` | second guard: even with a token, fleet dials go nowhere (`MC:rpc/rpc.go:45-50`) |
| `MOBILECLI_HOME=<private dir>` | its own daemon (see §4) |
| optional, for Android runs: `USBMUXD_SOCKET_ADDRESS=<dead path>` | mobilecli's go-ios can't reach usbmuxd, so no paired iPhone is queried (`GI:ios/usbmuxconnection.go:31-40`). Tested: enumeration just skips iOS |

- `XDG_CONFIG_HOME` also moves other tools' config, but only inside the mobilecli process tree (the daemon and its `adb`), so it's safe.
- There's no switch that stops the other Android phones being enumerated. The driver can only document it, or run its own adb server as the evidence runs did. ADB-level isolation stays out of scope for v1.2.0.
- mobile-mcp, for the record: it sends PostHog events on launch and on every tool call (hashed hostname plus Node path as the ID, client name, platform and version), and a Scarf pixel on the first tool call. `MOBILEMCP_DISABLE_TELEMETRY=1` turns both off (`MM:src/server.ts:130-143,160-213,219`; `MM:README.md:493,506-523`). This is one more reason not to depend on it.

### 4. Lifecycle

**Host daemon.**

- Every device command goes through `runViaDaemon` or `callDaemon`, which call `ensureDaemon()` first (`MC:cli/client.go:35-65`). So any command starts the daemon implicitly, including `devices`. `$` The first `mobilecli devices` left `mobilecli-darwin-arm64 daemon start --insecure-storage` running with PPID 1.
- Where its files live: `$MOBILECLI_HOME` or `~/.mobilecli`, holding `daemon.sock`, `daemon.pid` and `daemon.log`. The socket path must fit in 103 bytes on macOS (`MC:daemon/paths.go:10-60`).
- **Spawning:** `EnsureRunning` serialises spawns with a `spawn.lock` directory. It reuses a listening daemon of the *same version*, and otherwise shuts the running one down and spawns its own (`MC:daemon/ensure.go:26-62`). The spawned daemon runs in its own session (`MC:daemon/spawn_unix.go:10-13`) and **inherits the spawning client's environment**. `ANDROID_HOME`, the adb server port and the token settings all come from whichever client started it.
- **Idle:** an auto-started daemon exits after 30 minutes with no requests (`MC:cli/client.go:21`, `cli/daemon.go:135`, `daemon/server.go:151-177`). Recording or a mock location keeps it alive (`MC:server/daemon.go:38-40`). `$ mobilecli daemon start --idle-timeout 15s &` was reused by the next command (same PID), then logged "idle for 15s, shutting down".
- **Stop:** `mobilecli daemon stop` sends `daemon.shutdown`. In-flight calls get a 10 s grace period, then the daemon runs its shutdown hooks and removes its files (`MC:daemon/server.go:105-121`, `cli/daemon.go:65-81`). Only iOS devices register hooks (`MC:devices/ios.go:485,1629`), so nothing on an Android device is cleaned up.
- **Two clients sharing one home:**
  - The same version is safe: one daemon, one device cache, and per-device mutexes (`MC:commands/commands.go:198-211`, `cacheDevice`).
  - A different version on the same home is not. Suppose a developer's mobile-mcp (mobilecli 1.0.13) and the bridge (1.0.14) both use `~/.mobilecli`. Each call from one restarts the other's daemon ("Restarting daemon … version mismatch", `MC:daemon/ensure.go:44-53`), which kills any stream in flight.
- **Cached state:** the daemon caches each device, including its adb serial and its `DeviceServer` port, for its whole life (`MC:commands/commands.go:95,198-211`). An emulator that restarts on another port keeps its AVD ID but gets a stale serial until the daemon restarts.

**On-device `DeviceServer`.**

- The first call that needs it runs `startDeviceServer` (`MC:devices/android_device_server.go:69-113`); the first `dump ui` is enough. `$` In the adb shim log, one call made these adb calls:

  ```
  forward --list
  push …/mobilecli-agent-… /data/local/tmp/mobilecli.dex.<hash>.tmp
  shell mv -f … /data/local/tmp/mobilecli.dex
  shell pkill -f '[D]eviceServer'; pkill -f '[U]iDumpServer'; pkill -f 'com.mobilenext.[d]evicekit'; appops set com.android.shell android:mock_location default; true
  shell CLASSPATH=/data/local/tmp/mobilecli.dex nohup app_process / com.mobilenext.mobilecli.DeviceServer >/dev/null 2>&1 &
  forward tcp:54582 localabstract:mobilecli-server
  ```

- It first kills any earlier server, because "Only one UiAutomation may be registered system-wide" (`:82-89`), then starts a detached server (`:93`).
- **The server never exits on its own.** `DeviceServer.main` connects UiAutomation and runs `Looper.loop()`. It has no idle timer and no shutdown method (`MC:agents/android/java/DeviceServer.java:38-53`; its RPC methods are `:58-97`).
- A server from another mobilecli build is detected by the dex's SHA-256 and replaced (`MC:devices/android_device_server.go:70-76,185-202`). Two mobilecli versions on one device therefore keep restarting each other's server.
- If the server disappears mid-daemon, the next call starts it again once (`:210-228`). Killing it between runs is therefore safe.
- `$` While it ran, `adb exec-out uiautomator dump /dev/tty` printed `Killed` (it blocks other UI tools, as the spike found).
  - After `mobilecli daemon stop`: `DeviceServer` was still running, and the forward `emulator-5554 tcp:54582 localabstract:mobilecli-server` was still listed.
  - After `adb shell pkill -f com.mobilenext.mobilecli.DeviceServer`: the process was gone and uiautomator returned XML again. But `forward --list` still showed the forward, and `/data/local/tmp/mobilecli.dex` (72 KB) remained.
- **`mobilecli.so` is not pushed in normal use.** Only the WebView tools push it (`MC:devices/android_webview.go:141-160`). The spike's `.so` came from a WebView call or another tool.

**Recommendation: lifecycle rules for `AndroidDriver`.**

1. **One private daemon per bridge process.** Use `MOBILECLI_HOME=<os.tmpdir()>/jev-mcli-<pid>`, which is short enough for the 103-byte socket limit. Two bridge runs then never share or restart each other's daemon, and a developer's own mobilecli or mobile-mcp is left alone.
2. **Start the daemon explicitly.** Spawn `mobilecli daemon start --idle-timeout 5m`, detached, with `mobilecliEnvironment()`, and wait until `mobilecli daemon status` reports `running: true`. Later commands reuse it (same version), and a crash of the bridge leaves at most five idle minutes, not thirty.
3. **Pass `--device` on every call.** Without it, mobilecli picks the only online device, or fails when there are several (`MC:commands/commands.go:154-188`).
4. **`close` must clean up, in this order, and tolerate "not running" at each step:**
   - `mobilecli daemon stop`;
   - `adb -s <serial> shell pkill -f com.mobilenext.mobilecli.DeviceServer` (exit 1 just means none was running);
   - remove the forward: find the `localabstract:mobilecli-server` line in `adb -s <serial> forward --list`, then run `forward --remove tcp:<port>`;
   - then delete the private `MOBILECLI_HOME`.

   Leave `/data/local/tmp/mobilecli.dex` alone: it's inert, and the next start pushes it again. Registering the same cleanup for SIGINT and SIGTERM covers interrupted runs.
5. **Don't run another UI automation tool on the device during a run.** This includes mobile-mcp, Appium, `android layout` or raw `uiautomator`. Either side kills or blocks the other: mobilecli's start-up `pkill` matches any `DeviceServer`. The device lock by serial already enforces this among bridge runs.

### 5. Device IDs

- In `parseAdbDevicesOutput`, a serial starting `emulator-` becomes a device whose **ID is `getprop ro.boot.qemu.avd_name`** and whose adb transport is the serial. Every other device keeps its serial as its ID (`MC:devices/android.go:597-633`). The code comment says why: "for emulators, use AVD name as the consistent ID" (`:604`).
- The emulator's serial is only its console port, which changes with launch order. The AVD name also matches offline emulators listed from their `.ini` files, which `device boot` uses (`MC:devices/avd.go:114-…`, `devices/android.go:726-731`).
- The display name is the AVD name with spaces instead of underscores: `Medium Phone API 36.1` (`MC:devices/android.go:664-668`).
- All adb calls go through `-s <transportID>` (`MC:devices/android.go:216-229`).
- `FindDevice` compares only `d.ID()` (`MC:commands/commands.go:144-148`), so an emulator's serial is never accepted. `$ mobilecli dump ui --device emulator-5554` gives `{"status":"error","error":"error finding device: device not found: emulator-5554"}` with exit 1. The same call with `--device Medium_Phone_API_36.1` works.
- `mobilecli devices` doesn't print the serial (`MC:devices/common.go:365-373`), so its output can't be joined back to adb.

**Recommendation.** Scripts name the adb serial (`device.serial`, as settled). The driver translates it once in `prepare`:

- If the serial starts with `emulator-`, run `adb -s <serial> shell getprop ro.boot.qemu.avd_name`. A non-empty result is the mobilecli ID; if it's empty, use the serial. This is the same property mobilecli reads, so the two can't disagree.
- Otherwise the mobilecli ID is the serial itself.

One limit: two emulators running the same AVD (with `-read-only`) share one ID, and mobilecli drives whichever `adb devices` lists first. The driver should refuse a run when another online serial maps to the same AVD name, and say which serials clash. The report should name both the serial and the mobilecli ID.

### 6. Output contract

**Envelope.**

- `CommandResponse{status, data?, error?}`, where `status` is `"ok"` or `"error"` (`MC:commands/commands.go:13-17,41-55`). The CLI prints it indented on stdout (`MC:cli/client.go:42-54`).
- Agent status commands can also answer `"fail"`, with the reason in `data.message` (`MC:cli/client.go:94-106`).
- On error, the message is printed a second time to stderr, and **the exit code is always 1** (`MC:main.go:13-16`). There are no distinct codes.
- Cobra argument errors skip the envelope altogether. `$ mobilecli io text "-5" --device …` printed only `unknown shorthand flag: '5' in -5` to stderr, with exit 1.
- **Parse rule:** exit 0 means `status == "ok"`. On exit 1, read `error` from stdout if it parses as JSON, or else use stderr.

**Commands the bridge needs** (Android paths; all `$` runs on the emulator, warm daemon):

| Command | Result | Android implementation | `$` |
| --- | --- | --- | --- |
| `dump ui --device <id> --format raw` | `data.rawData`: **a string**, JSON `{"hierarchy":[…]}` from `DeviceServer`, or uiautomator XML when it falls back (`MC:commands/dump.go:38-46`; `devices/android.go:1658-1671,1632-1656`) | `DeviceServer` `device.dump.ui`, waits up to 2 s for idle (`MC:devices/android_device_server.go:17-32,230-250`) | cold 1.2 s including daemon and server start; warm about 20-30 ms on the launcher |
| `dump ui` (JSON) / `--format text` | `data.elements` with `@eN` refs / plain text | also probes for Flutter first: `dumpsys window`, `dumpsys package`, `run-as` on each call (`MC:devices/android.go:1673-1682`) | 3 extra adb shells per dump, so `raw` is cheaper |
| `io tap x,y` | `data.message` | `DeviceServer` `device.io.tap` (`MC:devices/android.go:530-536`) | 0.02 s |
| `io swipe x1,y1,x2,y2 [--duration ms]` | `data.message` | `device.io.swipe`, default 1000 ms (`:546-556`) | 1.03 s |
| `io text -- <text>` | `data.message` | ASCII through `device.io.text`. Non-ASCII goes through the clipboard and `KEYCODE_PASTE`, then clears the clipboard (`:956-990`) | 0.03 s for "hello"; "café" returned ok (not checked on screen) |
| `screenshot -o <path>` or `-o - [-f jpeg -q N --max-size N]` | `data.{format,filePath}`, or raw image bytes on stdout | `DeviceServer` screenshot | PNG 1080×2400; JPEG 360×800 with `--max-size 800` |
| `apps launch <pkg> [--activity A] [--locale …]` | `data.message` | `cmd package resolve-activity --brief`, then `am start --display 0 -n <component>`, without `-W` and with no extras (`MC:devices/android.go:445-488`) | 0.31 s |
| `apps terminate <pkg>` | `data.message` | `am force-stop` (`:490-497`) | 0.35 s |
| `device logs --device <id> [--filter k=v] [--limit N]` | **one JSON object per line** (`timestamp`, `message`, `level`, `pid`, `process`, `tag`), not an envelope, streamed until the limit or SIGTERM (`MC:cli/logs.go`; `cli/stream.go:18-58`) | `adb logcat -v threadtime,year -T 1`, plus `cat /proc/<pid>/cmdline` for each new PID (`MC:devices/android.go:1905-1950`) | `--limit 3` gave 3 lines, exit 0. SIGTERM gave exit 0 and the host logcat stopped |

**What the driver has to handle.**

- **Refs:** `dump ui --format raw` carries no `@eN` refs; only the JSON and text formats attach them (`MC:commands/dump.go:54`). Tap by the centre of `rect`, as the spike did.
- **Coordinates:** they are device pixels (the rect of a 1080-wide screen, and `io tap 540,1200`), not points as on iOS.
- **Fallback:** detect uiautomator XML in `rawData` (it starts with `<?xml`). Either parse it, or treat it as a failed capture and retry, since it means the `DeviceServer` couldn't start (usually another UiAutomation holder).
- **Text:** always pass `--` before the text argument.
- **Launch:** `apps launch` neither waits for the activity nor passes intent extras. The spike's plan for `adb shell am start -W … --es …` stands for `app.intentExtras`.
- **Errors worth mapping to reason codes**, as seen or read in the source:
  - `device not found: <id>` (`MC:commands/commands.go:150`);
  - `no launcher activity found for <pkg> (is it installed?)` (`$`, exit 1);
  - `device server did not start within 5s` (`MC:devices/android_device_server.go:103-108`);
  - `failed to get UIAutomator XML after 10 tries` (`MC:devices/android.go:1655`);
  - `invalid coordinate values…` (`$`).

## Consequences for the plan

- **ADR-0006** records `mobilecli@1.0.14` under FSL-1.1-ALv2, with the date it converts to Apache-2.0, the licence history above, and the rejected alternatives (`@mobilenext/mobilecli`, mobile-mcp).
- **`src/device`** gets `pinnedMobilecli()` and `mobilecliEnvironment()`. The runner calls the binary directly with `--insecure-storage`.
- **The Android driver's `prepare`** starts a private daemon and translates serial to ID. Its **`close`** runs the four clean-up steps in §4.
- **The Android setup guide** says:
  - mobilecli reads the other connected devices' properties when it starts;
  - the bridge ignores any `mobilecli auth login`;
  - mobile-mcp or other UI tools must not run on the same device during a check.
- **Tickets 05 and 06** can rely on the command table above. Two things it shows:
  - non-ASCII typing may already work through the clipboard. That's worth one on-screen check before the map keeps it out of scope;
  - `device logs` streams JSON lines but has no "follow this package across restarts" filter. The log pane still needs `pidof` and a filter by `pid` or `process`.

## Unverified

- The real-phone paths: the Xiaomi was off limits, and no USB phone was attached to the private adb server.
- Whether non-ASCII text actually lands in a focused field (the call returned ok with nothing focused).
- The uiautomator XML fallback of `--format raw`, read from the source only. Forcing it would have meant holding UiAutomation with another tool.
- The Intel-Mac binary (`darwin-amd64`). Its resolution follows the same pattern.
- Running two different mobilecli versions against one device, read from the source only (the dex-hash restart).
