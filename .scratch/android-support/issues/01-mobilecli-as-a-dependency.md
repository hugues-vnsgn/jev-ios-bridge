# mobilecli as a dependency: pinning, shipping, telemetry, and lifecycle

Type: research
Status: open
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
