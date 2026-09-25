# Device driver: CLI or MCP client, and its contract

Type: grilling
Status: resolved
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

## Answer

Use pinned MobileBuildMCP 2.7.1 through its CLI, since the validated projection needs full captures. The simulator must be booted and the app installed. Select a valid explicit UUID from the script, environment, or workspace configuration; reject aliases such as booted and canonicalize UUID case before locking. The owner dedicates the simulator to these runs. Never choose another booted device implicitly.

Preparation acquires a cross-process per-device lock and invokes the vendor logging launch, which restarts the app. Scripts must navigate from observed post-launch state; app-specific UI restoration is guarded, not assumed. The bridge does not build, install, reset, or seed app data. Cleanup terminates the app and releases the lock only after acknowledged operations finish. This lock coordinates bridge processes; external manual/device clients must respect the dedicated-device lease.

The adapter owns ephemeral references, one bounded refresh/rematch, command deadlines, safe error mapping and screenshot/log artifact paths. Changed/ambiguous refreshed targets require policy to stop or reobserve. Lost terminal acknowledgements or failed stop keep the lock; do not automatically reclaim it. The optional exact-frame no-ID button alias rule is justified only for this pinned provider's identical tap commands; generic/future adapters stay strict. Narrow driver contexts to app/device/preconditions and explicit action values, without requiring goal/Choice concepts. [Integration evidence](../scripted-integration-notes.md) records actual restart behavior, alias proof and fault probes.
