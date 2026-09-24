# Local environment: Jev key, pinned MobileBuildMCP, a dedicated simulator, test apps

Type: task
Status: open
Blocked by: none

## Question

There is nothing to decide here. "Feasibility run: measure Jev on real screens" cannot start until the following exist on this machine.

1. **A TypeSafe API key** in `TYPESAFE_API_KEY`, stored in `.env` (which is gitignored). The human gets the key from typesafe.ai.
2. **`mobilebuildmcp@2.7.1`, pinned and working.**
   - The Homebrew `xcodebuildmcp` on this machine is 2.6.2 and uses the old name. Replace it, or run the pinned package through `npx`.
   - Turn off its Sentry error reporting.
   - Check it works by taking a `snapshot-ui` of the dedicated simulator.
3. **A simulator dedicated to this project**, on iOS 26.x.
   - Record its UDID in `.mobilebuildmcp/config.yaml`.
   - Do not use "OPS iPhone", which belongs to other work.
4. **Test apps.**
   - By default, use the simulator's built-in apps: Settings, Contacts, Reminders, Weather, and Files. Weather, Reminders, and Contacts are the apps in Sentry's benchmark.
   - The human may add one of their own apps. If so, record its bundle id and confirm its screen text may be sent to TypeSafe.

To resolve, record what was done:

- where the key lives;
- the simulator's UDID;
- the exact MobileBuildMCP command;
- the app list, with bundle ids.
