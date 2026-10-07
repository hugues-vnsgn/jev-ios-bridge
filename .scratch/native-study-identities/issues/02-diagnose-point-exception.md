# Diagnose the native point exception from saved evidence

Type: research
Status: resolved
Blocked by: 01

The [reference study](../evidence/2026-10-07/report.md) reached its intended
fixture, but `accessibilityElementForElementAtPoint:error:` threw before any
reference acquisition. The handler records only `native-exception`.

Supervisor delegated source diagnosis to `implementer`. Inspect saved receipts,
the exact invocation, pinned provider sources and static installed framework
implementation. Establish a cause only if that evidence supports it; otherwise
identify the missing observation and smallest next diagnostic change.

No device/process operations, retained-container reads, signals, reset, cleanup,
replay, identity rotation or secret access. Preserve current source/build
bindings and the retained unknown-owner guard. No production ticket is accepted
by this research.

## Answer

The inspected simulator framework implements the direct point selector as an
unconditional macOS-only assertion stub. Binary hash, arm64 UUID, bounded
disassembly, decoded strings and build-path correspondence are preserved in
the [source diagnosis](../research/point-exception/report.md). Actual runtime
image UUID and caught exception details were not recorded, so the exact runtime
exception remains unproven.

Pinned WDA uses `testRunnerProxy` → `_XCT_requestElementAtPoint:reply:` for its
iOS point path. That is the concrete alternative lead. Its bounded wait does
not certify native settlement. The supervisor owns callback-contract/design
investigation; no further device admission or cleanup is authorized by this
finding, and all 23 production requirements remain pending.
