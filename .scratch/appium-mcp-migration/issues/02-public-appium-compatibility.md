# Public Appium compatibility boundaries

Type: research
Status: resolved
Claimed by: /root/compatibility_research
Labels: wayfinder:research
Mode: AFK
Parent: [Appium migration handoff map](../map.md)
Blocked by: none

## Question

Which pinned public MCP/core capabilities can preserve every current driver operation and public mode, and which need the already-permitted bounded extension or native helpers?

## Required investigation or discussion

Map launch arguments, intent extras, observation, all-match targeting, replacement text, gestures/back/scroll, coordinates, attach/capture, logs/health and lifecycle. Include existing device-selection/config compatibility. Cite pinned source paths and primary docs; distinguish source support from live proof.

## Completion criterion

Record a sourced answer or actual owner decision, unresolved limits, and the changes required in the linked phase specification. Keep planning resolution separate from implementation and native acceptance.

## Context

- [Current roadmap](../roadmap.md)
- [Published acceptance spec](../spec.md)
- [Phase specification](../phases/phase-3-adapter.md)

## Comments

Charted on 2026-10-14. Implementation remains paused.

## Answer

Research resolution, 2026-10-14: Pinned public core permits bounded extension operations. Set-value echo/append semantics, convenience gesture retries and remote attach differ from preserved bridge behavior. Preserve legacy configuration/device selection and qualify extension operations, observation and diagnostics before claiming live parity.

[Sourced report](../research/public-compatibility.md). Research branch commit: `b0a481c21abbcded69e654a85491e2bb9b4ee272`.
No device experiment, test suite, Jev query, migration or native GO was performed.
