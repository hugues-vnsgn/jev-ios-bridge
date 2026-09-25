# Where bridge time goes

Measured 2026-09-25 on the dedicated simulator (`0E42FDE2-…`, iOS 26.4) with `mobilebuildmcp@2.7.1`, npm 10.9.7 and Node 26.8.1, for the "Where bridge time goes" ticket. No product code changed. Sources are the archived bridge journals, a new interleaved micro-benchmark, and the installed MobileBuildMCP 2.7.1 package (paths below are relative to its `build/` directory).

## Summary

Jev judgment is 3% of bridge step time. The rest is device work, and a large part of it is process overhead rather than the device:

- **`npx` adds about 0.5 s to every device command** (median 488–520 ms per command type, 12 interleaved rounds). Part of it is a registry round-trip that `npx --yes pkg@version` makes on every call.
- **CLI startup adds about 0.33 s more per command**, even when called directly. It builds the whole tool catalog whatever command was asked for.
- **Every action already captures the settled screen and throws it away.** MobileBuildMCP polls after each tap, type, or swipe until the screen has been stable for 100 ms (up to 2.5 s) and returns that snapshot. The bridge ignores it and captures again at the start of the next step.
- **The settle wait itself is real device time.** Real-app taps take a median of 3.1 s against 1.5 s on the static fixture, and typing takes 4.2 s. The difference is animation settling and multi-step typing inside MobileBuildMCP. It isn't removable without changing what the bridge waits for.

## Recorded step timings

The 64 steps of the four scripted benchmark runs (`spikes/benchmarks/results/bridge-step-timings.csv`):

| Step kind | Steps | Median observe | Median act | Median judge | Median total |
| --- | ---: | ---: | ---: | ---: | ---: |
| action | 53 | 2,505 ms | 3,312 ms | 0 | 5,842 ms |
| checkpoint | 9 | 2,481 ms | 0 | 961 ms | 3,484 ms |
| wait | 2 | 2,537 ms | 0 | 0 | 2,543 ms |

Across all steps, observation was 164.2 s (47%), actions 175.7 s (50%), and judgment 9.4 s (3%) of 349.9 s. Each step captured once; no reference refresh or expiry occurred.

By action kind (the three verified runs' journals): tap median 3,112 ms (n=29, 1,799–4,949), replaceText median 4,216 ms (n=10, 3,115–5,284), and one swipe at 4,748 ms.

## Commands per step

From `src/device/index.ts`:

- **Observe** issues `ui-automation snapshot-ui` (with `--verbose` for full captures), then `ui-automation screenshot` when screenshots are on, and reads the log tails. That's two processes.
- **Act** issues one `tap`, `type-text`, or `swipe`. It observes again only when the reference is within 5 s of its 60 s expiry, or after an expired or missing reference.
- **Wait** polls observe until its guard holds.

The 64 recorded steps therefore spawned about 180 device processes: 128 for captures and about 53 for actions.

## Micro-benchmark: `npx` versus the resolved CLI

`spikes/benchmarks/perf/device-latency.mjs`, raw results in `spikes/benchmarks/perf/device-latency-2026-09-25.json`. Each command ran 12 times through `npx --yes mobilebuildmcp@2.7.1` and 12 times through `node <npx-cache>/mobilebuildmcp/build/cli.js`, alternating the order each round, from the repo root on the diagnostic fixture. All 120 calls succeeded.

| Command | `npx` median | Direct median | `npx` overhead |
| --- | ---: | ---: | ---: |
| `--version` (startup only) | 857 ms | 337 ms | 520 ms |
| `snapshot-ui` (compact) | 984 ms | 496 ms | 488 ms |
| `snapshot-ui --verbose` (full) | 975 ms | 490 ms | 485 ms |
| `screenshot --return-format path` | 1,310 ms | 795 ms | 515 ms |
| `tap` (fixture button) | 1,486 ms | 988 ms | 498 ms |

Full and compact captures cost the same. Subtracting direct startup (337 ms), the device work itself is about 0.15 s for a snapshot, 0.45 s for a screenshot, and 0.65 s for a tap on a static screen. A single separate run by the research agent measured `tools` at 0.80–0.86 s through `npx`, 0.62 s with `npx --offline`, and 0.37 s direct. That puts the registry check at about 0.2 s of the `npx` overhead.

## What MobileBuildMCP does per call

Facts from the package source:

- **`npx` resolution:** the package isn't in the cwd tree, so npm fetches the manifest with `preferOnline: true` (a registry round-trip) on every call, loads the global and npx-cache trees, and then starts a second Node process (`libnpmexec/lib/index.js:27,35-60,174-213,247`).
- **CLI startup** (`cli.js:114-148`) loads config and builds the tool catalog by parsing every YAML manifest and importing every exposed tool module (`runtime/tool-catalog.js`).
- **A per-workspace daemon already exists.** Stateful tools, including `snapshot_ui`, `tap`, `type_text`, `swipe`, `batch`, and `wait_for_ui`, run in a daemon that starts on first use and exits after 10 idle minutes (`runtime/tool-invoker.js:249-278,395-435`; `daemon/idle-shutdown.js:3`). It listens on a Unix socket with an internal, versioned protocol (`DAEMON_PROTOCOL_VERSION = 8`, `daemon/protocol.js:1`). Element references and their 60 s expiry live in the daemon's memory, which is why references survive across CLI calls. `screenshot`, `launch-app`, and `stop` run in the CLI process itself.
- **Post-action settle:** after tap, type, or swipe, MobileBuildMCP polls AXe `describe-ui` every 100 ms until the screen is unchanged for 100 ms, with a 2.5 s timeout (`mcp/tools/ui-automation/shared/post-action-snapshot.js:6-8,35-76`). It stores that snapshot as current and returns it as the action's `capture`. With `--verbose`, the capture is full and the action result uses `schemaVersion "3"` (`cli/register-tool-commands.js:75-86`). The bridge accepts only `"2"` today.
- **Typing** runs three AXe processes: a focus tap, select-all, then type (`type_text.js:94-126`).
- **Screenshots** run `simctl list -j`, `simctl io screenshot`, `swift -e` for orientation, and `sips` to resize (`screenshot.js:115-117,170-205`).
- **The MCP stdio server** (`mobilebuildmcp mcp`) returns compact snapshots only; full snapshots are CLI-only with `--verbose` (`utils/tool-registry.js:17-31`).
- **AXe 1.8.0** has no resident mode, and `describe-ui` is not a valid batch step. MobileBuildMCP 2.7.1 is still the latest release, and nothing newer touches batching or capture speed.

## Options

Estimates are inference from the numbers above, per device command or per step, and assume screenshots stay on.

| Option | Expected saving | ADR-0002 fit | Risk |
| --- | --- | --- | --- |
| **A. Resolved binary.** Pin `mobilebuildmcp@2.7.1` as a dependency and run its `build/cli.js` through the driver's existing `executable`/`prefixArgs` options. | ~0.5 s per command; about 90 s of the 350 s recorded (≈26%) | Fits | Low. Same CLI, same outputs. |
| **B. Reuse the post-action capture.** Request `--verbose` on actions, accept schema `"3"`, and use the returned settled capture as the next step's observation. Capture separately only when it's missing or the settle timed out. | One `snapshot-ui` per action step: ~0.5 s direct, ~1.0 s via `npx` | Fits | Medium. The next guard sees the post-settle screen, not a later one, so waits and transitions longer than the settle window must stay explicit. Needs guard and verdict regression tests. |
| **C. Screenshot beside the snapshot.** Run the screenshot concurrently instead of after the snapshot. | Up to ~0.45–0.8 s per capture | Fits | Low to medium. Needs a check that the concurrent screenshot shows the same screen as the snapshot. |
| **D. Long-lived client.** Talk to the daemon socket, or hold `mobilebuildmcp mcp` open for the run. | ~0.35 s more per command on top of A | Socket: fits in spirit, but depends on internal protocol 8. MCP server: fits. | The socket is an internal protocol that can break on any upgrade. The MCP server loses full captures. |
| **E. `npx --prefer-offline`.** | ~0.2 s per command | Fits | Low, but A dominates it. |
| **F. Call AXe or simctl directly.** | n/a | Ruled out by ADR-0002 | n/a |

A, B, and C combine. On the recorded medians, an action step of about 5.8 s would lose about 1.5 s from A, about 0.5 s from B, and up to about 0.5 s from C, reaching roughly 3.3–3.8 s. That is inference, not a measurement. The settle waits and typing inside actions remain.

## Limits

- The micro-benchmark used a static fixture screen, so it isolates process overhead rather than real-app settle time.
- One machine, one simulator, a warm `npx` cache, and a warm MobileBuildMCP daemon.
- The option estimates haven't been implemented or measured end to end. The performance target ticket should set a target and require a measured re-run.
