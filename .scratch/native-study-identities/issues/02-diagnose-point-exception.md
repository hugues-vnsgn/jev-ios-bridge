# Diagnose the native point exception from saved evidence

Type: research
Status: claimed
Claimed by: supervisor
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
