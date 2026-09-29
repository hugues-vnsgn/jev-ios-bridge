# Where Android plugs into the code

Type: grilling
Status: claimed
Claimed by: Claude Code (owner session)
Blocked by: 03

## Question

How does Android enter the codebase without disturbing the iOS path?

- **Driver choice:** where the platform picks the device driver (`BridgeService.createDriver`, `src/cli.ts`, the MCP server). Is one driver per platform behind the existing `DeviceDriver` seam right, and what can the two drivers share: device locks, the reference-refresh logic, log tails?
- **Projection and vocabulary:** `renderAssertionState` hard-codes "Current iOS screen". Decide where platform-specific projection lives, and how `bridgeRole` handles Android classes.
- **Tap alias rule:** it's MobileBuildMCP-only today. Confirm Android never enables it.
- **Tests:** a fake mobilecli runner, like `CliRunner` for MobileBuildMCP, plus golden contract tests extended without changing existing entries.
