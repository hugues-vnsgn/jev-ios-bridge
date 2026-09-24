# MobileBuildMCP: simulator and real-iPhone capability

Type: research
Status: resolved
Blocked by: none

## Question

What does XcodeBuildMCP, now MobileBuildMCP, give the bridge on a simulator and on a real iPhone, and how should the bridge call it? Establish:

- the snapshot format and how long an element reference lasts;
- how actions are addressed;
- the CLI and MCP modes, and what the daemon does;
- the automation backend;
- what works on a physical device.

## Answer

- **The rename:** on 2026-09-23 the project became MobileBuildMCP, at version 2.7.1. The package, binary, config directory, and environment prefix all changed, with no fallback to the old names.
- **Snapshot data:**
  - The compact snapshot holds at most 64 targets and costs about 600 tokens. It is available over both the CLI and MCP.
  - Full element data costs about 13,200 tokens minified. Only the CLI returns it, with `--output json --verbose`.
- **Element references:** a reference is a position in one snapshot. It expires after 60 s, is valid only in the process that took the snapshot, and is replaced after every action.
- **Tooling:**
  - Every CLI tool can emit JSON.
  - AXe 1.8.0 is bundled and supports Xcode 26.
  - Typing is limited to US-keyboard characters.
  - Screenshots are JPEGs, at most 800 px on the longest side.
- **Real iPhones:** MobileBuildMCP can build, install, launch, stop, and run tests on a device. It has no snapshot, tap, type, screenshot, or log tools there.

Evidence: [mobilebuildmcp-simulator-and-device.md](../../../docs/research/mobilebuildmcp-simulator-and-device.md). A sample snapshot is in [assets/snapshot-sample.txt](../../../docs/research/assets/snapshot-sample.txt).
