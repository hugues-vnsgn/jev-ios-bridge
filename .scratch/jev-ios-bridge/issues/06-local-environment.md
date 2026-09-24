# Local environment: Jev key, pinned MobileBuildMCP, a dedicated simulator, test apps

Type: task
Status: resolved
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

## Answer

Verified 2026-09-24 in the release worktree. [Environment evidence](../environment-evidence.md) records commands and capture results.

- The owner confirmed the real key in the original checkout's `.env`. A presence-only check passed; the main agent's authenticated `GET /v1/models` returned HTTP 200. The key was neither printed nor copied to the worktree.
- Dedicated simulator: `jev-ios-bridge`, iPhone 17 Pro Max, iOS 26.4, UDID `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7`. It is booted and pinned in `.mobilebuildmcp/config.yaml` with Sentry reporting disabled.
- Command: `npx -y mobilebuildmcp@2.7.1 ui-automation snapshot-ui --simulator-id 0E42FDE2-5E09-42D3-9876-9EF0037FCBE7 --output json`; add `--verbose` for full elements.
- Verified launch and capture: Settings (`com.apple.Preferences`), Contacts (`com.apple.MobileAddressBook`), Reminders (`com.apple.reminders`), Files (`com.apple.DocumentsApp`). These include all three apps selected by the accepted feasibility plan.
- Weather (`com.apple.weather`) is not installed. This does not block the selected feasibility corpus, but the Weather benchmark in ticket 17 remains unverified until its app is available. Do not substitute another app and report the benchmark as complete.

No OPS simulator or physical device was used.
