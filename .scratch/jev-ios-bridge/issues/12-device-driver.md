# Device driver: CLI or MCP client, and its contract

Type: grilling
Status: open
Blocked by: 05, 09

## Question

How does the device driver reach MobileBuildMCP, and what does it promise the run loop? Decide:

- **Transport: CLI or MCP client.**
  - The CLI returns JSON with full data available, takes about 1.4 s per snapshot, and depends on a per-workspace daemon.
  - The MCP client takes about 0.7 s, returns compact data only, and needs session defaults set first.
  - What "Observation schema: what Jev sees each step" says about full versus compact data mostly settles this.
- **Device selection:** an explicit UDID, else the project default. Never a simulator the developer is using.
- **The app:** does the bridge build it, install a built `.app`, or only launch it by bundle id? Also decide where build output goes, so the watch view can show it.
- **App state:** between runs, reset it, reinstall, or leave it. At the end of a run, terminate the app or leave it running.
- **Expired references:** take a new snapshot and match the element again. Decide how a failed match is reported.
- **Interruption:** what SIGINT, SIGTERM, and the wall-clock limit do to the app under test.
- **Concurrency:** MobileBuildMCP processes share no references and do not queue actions. Decide how to prevent a second driver on the same simulator, whether that is another run or the developer's own MobileBuildMCP.
- **The seam for a second device layer.** "Driving a real iPhone: what a second device layer takes" found WebDriverAgent to be the most plausible option. It has no element handles and reports placeholder text as the field's value.
