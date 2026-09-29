# mobilecli as a dependency: pinning, shipping, telemetry, and lifecycle

Type: research
Status: resolved
Claimed by: research subagent (charting session)
Blocked by: none

## Question

What does the bridge have to do to depend on mobilecli safely, the way it pins MobileBuildMCP 2.7.1 today?

- **Distribution and pinning:** which package to depend on (`@mobilenext/mobilecli`, or the platform binary `@mobilenext/mobilecli-darwin-arm64`, or mobile-mcp), how the binary is resolved on disk (like `pinnedMobileBuildMcpCli()`), and whether the plugin's `npm ci --ignore-scripts` install keeps it executable. Which version to pin, and how often it releases.
- **Licence:** confirm the exact licence of the pinned binary and npm wrapper (the GitHub repo says FSL-1.1 with an Apache-2.0 future licence; the npm wrapper says MIT), for the ADR.
- **Network and telemetry:** does mobilecli send telemetry, crash reports or cloud calls ("no remote token: not logged in")? How is each turned off?
- **Lifecycle:** the host daemon (`~/.mobilecli/daemon.sock`), whether commands start it implicitly, whether it idles out, and how two bridge runs share it. The on-device `DeviceServer`: what starts it, whether it can be stopped cleanly, and what `pkill` leaves behind (`/data/local/tmp/mobilecli.dex`, `mobilecli.so`).
- **Device IDs:** why emulators are named by AVD name in mobilecli but by serial in `adb`, and how to translate between them reliably.
- **Output contract:** the JSON envelope (`status`, `data`, `error`), exit codes, and which commands the bridge needs: `dump ui --format raw`, `io tap`, `io swipe`, `io text`, `screenshot`, `apps launch/terminate`, `device logs`.

Only the emulator may be used for experiments, with cleanup afterwards (see the map's Notes).

## Comments

- 2026-09-29, from "Assemble the v1.2.0 spec" (owner decision B): the private `MOBILECLI_HOME` is per **run**, not per bridge process, because one MCP process can drive two emulators and one run's `close` would stop the other's daemon.

- Research note: `docs/research/mobilecli-dependency.md` on branch `research/mobilecli-dependency` (commit `f785c75`). Gist:
  - Pin the unscoped `mobilecli@1.0.14`, which is FSL-1.1-ALv2 (npm said MIT only up to 1.0.11, a packaging bug). Run the platform binary directly, because the npm wrapper orphans the process on SIGTERM. `npm ci --ignore-scripts` keeps it executable.
  - mobilecli has no telemetry. Its only cloud path is the `api.mobilenext.ai` fleet, used only if a login token exists. Pass `--insecure-storage` with a private `XDG_CONFIG_HOME` and set `MOBILECLI_FLEET_URL=ws://127.0.0.1:9`. Its first device lookup still reads properties from every phone on the Mac.
  - Give each bridge process its own `MOBILECLI_HOME` and pre-start the daemon with `--idle-timeout`. `close` runs `daemon stop`, `pkill` of the `DeviceServer`, and `adb forward --remove` (the forward leaks otherwise).
  - Emulator IDs come from `getprop ro.boot.qemu.avd_name` on the serial. Every error exits 1. `dump ui --format raw` returns a JSON string, or XML when it falls back to uiautomator.

- 2026-09-29, from the domain-model session ([`domain-model.md`](../domain-model.md), [ADR-0006](../../../docs/adr/0006-mobilecli-device-agent-as-android-device-layer.md), decision G): **the bridge never runs mobilecli.** It copies mobilecli's device agent out of the pinned program, checks it against a pinned SHA-256, and drives it directly over JSON-RPC. So this Answer's host-daemon rules no longer apply: the private `MOBILECLI_HOME`, the explicit daemon start, `--device`, the envelope parsing, and the fleet, token and keychain guards. The pin, the licence, the agent's lifecycle on the device, and the cleanup of the agent and forward still stand.

## Answer

Resolved 2026-09-28 by research. Full note: `docs/research/mobilecli-dependency.md` on branch `research/mobilecli-dependency` (`f785c75`).

- **Pin** the unscoped `mobilecli` at exactly 1.0.14 (FSL-1.1-ALv2; it becomes Apache-2.0 on 2028-09-27). Run the platform binary directly, not the npm wrapper, which orphans the process on SIGTERM. `npm ci --ignore-scripts` keeps it executable.
- **Network:** no telemetry. To keep it off the keychain and the cloud fleet, pass `--insecure-storage`, use a private empty `XDG_CONFIG_HOME`, and set `MOBILECLI_FLEET_URL=ws://127.0.0.1:9`. Its first device lookup still reads every Android phone and paired iPhone on the Mac.
- **Lifecycle:** give each bridge process a private `MOBILECLI_HOME` and start the daemon with a short `--idle-timeout`. `close` stops the daemon, kills the on-device `DeviceServer`, and removes its `adb forward`.
- **Device IDs:** an emulator's mobilecli ID is `getprop ro.boot.qemu.avd_name` read over its serial. It isn't unique when two emulators run the same AVD.
- **Output:** a `status`/`data`/`error` envelope, and every failure exits 1. `dump ui --format raw` returns a JSON string, or uiautomator XML on fallback.
