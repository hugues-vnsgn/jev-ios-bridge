# Integration mode with XcodeBuildMCP, and the DeviceDriver contract

Type: grilling
Status: open
Blocked by: 01, 02

## Question

Where does the run loop live, and how does it reach XcodeBuildMCP? Three shapes:

1. **Bridge-owned loop, CLI adapter.** The bridge's MCP server runs the whole loop and shells out to `xcodebuildmcp <workflow> <tool>`; the host agent makes one tool call and gets a report.
2. **Bridge-owned loop, MCP-client adapter.** Same, but the bridge spawns `xcodebuildmcp mcp` and talks MCP to it.
3. **Host-agent-owned loop.** No device code in the bridge at all. Claude Code has XcodeBuildMCP installed directly; the bridge exposes only Jev judgment tools (`jev_choose_action`, `jev_check_assertion`) and the `/test-ios` command scripts the loop in the host agent. Cheapest to build, but every step spends host-agent tokens and the loop is not autonomous.

Decide the shape, then the `DeviceDriver` contract it implies: device selection (explicit UDID, else the single booted simulator, else session default), install `.app` vs launch by bundle id in v1, app state reset between runs, what SIGINT/SIGTERM and timeouts do to the app under test, how concurrent runs are prevented, and version pinning of XcodeBuildMCP.
