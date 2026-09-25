# Live log pane: the app's output in its own terminal window

Type: prototype
Status: open
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
