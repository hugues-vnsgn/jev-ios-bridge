---
status: accepted
date: 2026-10-12
implementation: in-progress
---

# Appium MCP as the shared device layer

Replace MobileBuildMCP on iOS and mobilecli's device agent on Android with one Appium MCP adapter. The owner chose a shared device layer while retaining bridge-owned scenarios, guards, Jev assertions, ownership, recovery, and reports. Keeping the two providers would preserve their existing integrations but continue separate execution paths and leave physical-iPhone automation needing another provider.

Use a private local process and explicitly owned sessions. Permit a small, versioned extension through Appium MCP's public core interface for required structured results and session inventory; private imports and an upstream fork remain outside the design. Freeze the resolved driver graph and WDA runtime artifacts, since pinning the wrapper does not freeze the automation it runs.

Appium is the sole UI observation and input layer. Retain bounded native helpers for app logs and crash detection, owned-automation fencing, simulator presentation, and ADR-0009's existing fresh-simulator creation. Prefer proven public Appium capabilities; keep helpers behind ownership, deadlines, and the driver lifecycle. Observers are read-only, fencing stops only recorded owned automation, and normal cleanup cannot erase phones or delete allocations. Retire the AXe tap path at cutover. This boundary preserves capabilities the inspected MCP tools do not provide while keeping one UI automation path.

Cut over only after the v1.4.0 modes, complete user-visible driver behavior, both frozen assertion corpora through the Appium observation path, and live replacement-device acceptance pass. Physical-iPhone enablement follows separately. The current backends remain the implementation until those gates pass; they are not a fallback in the target architecture.

This decision replaces the provider choices in ADR-0002 and ADR-0006 upon cutover, and retires ADR-0007's AXe tap exception while preserving its optional presentation. ADR-0009's bounded creation constraints survive. [The migration plan](../../.scratch/appium-mcp-migration/plan.md) records the selected base and acceptance gates. ADR-0008 and ADR-0009 are present in that selected v1.4.0 base; their absence from the older planning checkout does not retire their constraints.
