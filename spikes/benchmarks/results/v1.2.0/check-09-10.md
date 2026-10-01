# Checks 9 and 10: the plugin, Android only, and the quickstart walkthrough

Run by the owner on 2026-10-01 with a guided script, on candidate `d0bc224` (main after PR #33), on `Medium_Phone_API_36.1` through the private adb server on port 5099.

## Setup and deviations

- **A throwaway `CLAUDE_CONFIG_DIR`,** made for this check and deleted afterwards.
- **The plugin came from a local marketplace,** because the public marketplace still pointed at 1.1.0. It served the exact zip that the v1.2.0 release publishes (SHA-256 `7a108f16a4ee69f7c68c45e6cc3208b5256937b5500337c03786b57e0ee9497b`), unpacked as a directory source. That marketplace sat inside the repo folder, so the MCP server, started from the unpacked copy, could also resolve the repo's own `node_modules`. The install's own `npm ci` did fetch the dependencies. The post-publish check installs from the real release.
- **The source was checked out at `d0bc224`,** where the quickstart names the `v1.2.0` tag, which didn't exist yet. This is the pre-tag deviation 1.0 also made.
- **The emulator ran on port 5099** (`ANDROID_ADB_SERVER_PORT`), so the plugin's server had to see that variable to reach it.

## Attempt 1 (failed, fixed in PR #33)

- `claude plugin install` never asks for a plugin's settings, but the docs said it did. The key stayed unset, so Claude Code skipped the bridge's server: its log says `Plugin option "typesafe_api_key" isn't set`. The session then fell back to the repo's command line. The docs now say to enter the settings under `/plugin` → **Installed** → `jev-ios-bridge` → **Configure**.
- The terminal used had been started by a log pane, so it carried the bridge's environment, the Jev key included. The pane now opens the terminal without the key or any `JEV_*` setting.

## Attempt 2 (pass)

**Check 9:**
- `claude plugin install jev-ios-bridge@jev-ios-bridge-local` exited 0. The installed plugin is version 1.2.0, and its install brought `mobilecli` 1.0.14.
- The plugin's own `capture --avd Medium_Phone_API_36.1`, with no key, exited 0 and printed the launcher's 18 elements. So the device agent copied out of the pinned mobilecli program and matched the pinned SHA-256.
- After **Configure** (the owner typed the key, left the simulator empty, and set the Android device), `claude mcp list` showed `plugin:jev-ios-bridge:jev-ios-bridge … ✔ Connected`.

**Check 10:**
- In a project folder outside the repo, `/jev-ios-bridge:test-android run jev-ios-bridge-src/examples/diagnostic-app-android/scenario.json and tell me what the report says` ran through the plugin's tools (`start_scenario`, then `get_report`), not the command line.
- The run `4d3ea382` came back **failed**, `ASSERTION_FALSE`: "Total: $5" scored 0.02, and the screen showed `Total: $3`. Its evidence landed in the project's `.jev-runs/`.

**Check 6 for this run:** checked after the emulator was shut down, so only on the Mac. There was no lease file, no `adb logcat` process, and no mobilecli process. The run log ends with its verdict after a 0.18 s cleanup, and the bridge releases the lease only once its agent and forward are gone.
