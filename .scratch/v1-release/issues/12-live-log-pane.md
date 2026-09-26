# Live log pane: the app's output in its own terminal window

Type: prototype
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

How should the live log pane look and behave? The owner made it a 1.0 requirement in "The 1.0 stable contract". It shows the **app's own output** (`print`, `os_log`, crashes), like Xcode's console, streamed live during a run, in a **terminal window the bridge opens automatically** when a run starts. Prototype a rough version and react to it with the owner. Settle:

- **The log source:** what MobileBuildMCP 2.7.1 exposes for live app logs (the bridge already tails the log paths returned by `launch-app`). The source must stay inside ADR-0002: no `simctl` or AXe calls of the bridge's own.
- **Which terminal opens:** macOS Terminal, iTerm, the user's default. How is it chosen or configured?
- **The fallback** when no window can open (CI, SSH, headless, permission denied): print the attach command instead, and never fail the run.
- **Lifecycle:** what happens when the run ends, is cancelled, or the MCP server closes, and whether the window closes or stays with a final line.
- **Filtering and privacy:** subsystem or level filters; whether supplied values are redacted here the way they are in the journal; and that nothing streams to Jev or the host.
- **Setting:** how a developer turns auto-open off.

Link the prototype as the asset.

## Answer

Decided with the owner on 2026-09-25, after they watched the prototype run. **Prototype:** `spikes/log-pane/PROTOTYPE-log-pane.mjs` on the throwaway local branch `prototype/log-pane` (commit `977c5a4`), not on main. A sample of its output from a 30 s `cmp` run is in `spikes/log-pane/sample-output-first-run.txt` on that branch.

1. **Log source:** the two files MobileBuildMCP 2.7.1 `simulator launch-app` returns and keeps writing while the app runs:
   - `runtimeLogPath`: the app's stdout and stderr through `simctl launch --console-pty`, covering `print`, `NSLog`, and Kotlin `println`;
   - `osLogPath`: `log stream --level=debug --predicate 'subsystem == "<bundle ID>"'`.

   The pane only reads these files, so it stays inside ADR-0002. `simulator stop` ends both writers.
2. **Documented gaps:**
   - Only `os_log`/`Logger` messages whose subsystem is exactly the bundle ID appear, so the guide tells developers to use the bundle ID as the subsystem.
   - Crash reports aren't captured. When the bridge sees the app die mid-run, the pane prints "app stopped unexpectedly".
   - Nothing is asked of MobileBuildMCP before 1.0.
3. **Layout:** kept as prototyped.
   - A header line gives the bundle ID and run ID, the two source paths, and "local only; supplied values are masked".
   - Each line shows its time (the `NSLog` time when present), then `[app]` or `[os]`, then the text. Errors and faults are red; debug and info are dim.
   - `log stream`'s own chatter is dropped. Everything the app and simulator print is shown, like Xcode's console, with no noise filter.
4. **Which terminal:** the bridge writes a `.command` file into the run's folder and opens it through LaunchServices (`open`). That picks the app macOS uses for `.command` files, normally Terminal.app, with no AppleScript and no Automation permission prompt. `JEV_LOG_PANE_APP=<app name>` overrides it (`open -a`).
5. **Fallback:** under SSH (`SSH_CONNECTION`), CI (`CI`), no GUI session, when turned off, or when `open` fails, no window opens and the run carries on unaffected. The bridge prints the attach command to stderr, and MCP adds it to `start_scenario`'s reply. The attach command is a new CLI command, **`jev-ios-bridge logs RUN_ID`**, which follows the same files in any terminal.
6. **Lifecycle:**
   - One window opens per run, after the app launches.
   - At the end it prints the verdict and the evidence path.
   - **After a passed run it closes itself after a few seconds.** After a failed or inconclusive run, a cancellation, or the MCP server closing, it prints a final line and stays open until the developer closes it.
7. **Privacy:**
   - Supplied values are masked (`[value:<key>]`), as in the journal.
   - Nothing in the pane goes to Jev or the host agent.
   - The pane keeps no copy of its own; the evidence records only the two log paths. MobileBuildMCP's log files stay where it writes them, under its own retention.
   - There's no level or keyword filter in 1.0.
8. **Setting:** on by default for both the CLI and MCP. It turns itself off under SSH, CI, or no GUI session. To turn it off yourself, use `JEV_LOG_PANE=off` (which also works in the MCP config's `env` block) or the CLI flag `--no-log-pane`.
9. **Contract:** per ADR-0005 the pane itself isn't frozen. `logs`, `--no-log-pane`, `JEV_LOG_PANE`, and `JEV_LOG_PANE_APP` are new 1.x-compatible additions and are documented in guide page 06.

## Comments

- 2026-09-26, release check 8: after a pass the pane process ends 3 s later, as designed, but Terminal keeps the window (`[Process completed]`) under its default "When the shell exits: Don't close the window" setting. Closing it would need macOS Automation permission. **Owner decision:** keep it open, and the docs and the pane's final message explain the Terminal setting. Item 6's "closes itself after a pass" now means "the pane finishes; Terminal's setting decides the window".
