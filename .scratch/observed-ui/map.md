# Map: experimental observed iOS actions

## Destination

A runnable local alternative for unmodified apps: one action attempt, visible
outcome verification, persistent uncertainty and no automatic replay.

## Notes

The user chose this narrower contract on 2026-10-07 after confirming that the
native-provider route was unavailable. See [spec](spec.md) and [plan](plan.md).

## Decisions so far

- 2026-10-08: all three live cases passed after the experimental touch-path fix.
  [Live report](live/report.md); [integration verification](integration/verification.md).

- Use the existing MobileBuildMCP driver with an explicit no-retry tap path.
- Keep uncertainty in a durable journal; do not claim native contact release.
- Leave legacy script formats and the 23 native-certification tickets unchanged.

## Route

<!-- route:start -->
```mermaid
flowchart LR
    T01["01 Observed tap executor<br/><small>task</small>"]
    T02["02 Durable attempts and quarantine<br/><small>task</small>"]
    T03["03 Runnable experiment and review<br/><small>task</small>"]
    T04["04 Validate the observed action on a dedicated simulator<br/><small>task</small>"]
    T01 --> T04
    T02 --> T04
    T03 --> T04
    classDef resolved fill:#e4e4e7,stroke:#a1a1aa,color:#52525b
    classDef claimed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef frontier fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef blocked fill:#ffffff,stroke:#a1a1aa,color:#18181b
    class T01,T02,T03,T04 resolved
```
<!-- route:end -->

## Not yet specified

Production schema integration and automatic provisioning of fresh dedicated devices.

## Out of scope

Native ownership/contact certificates and automatic replay after uncertainty.
