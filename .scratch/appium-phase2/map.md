# Appium Phase 2 decision map

Labels: wayfinder:map
Status: charted

## Destination

Phase 2 is implementation-ready: every open decision for profiles, the single
admission authority and recovery is locked in
[the Phase 2 specification](../appium-mcp-migration/phases/phase-2-ownership.md),
with one bounded brief per package (2A–2D) for the implementer.

## Notes

Planning only; building starts after this map closes, under the package briefs
(as Phase 1 finished: owner decisions first, then capped briefs with stop rules).
Phase 1 GO is the entry evidence ([PR #53](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/53)).
The owner wants a solid, extensible foundation: one ownership authority for every
entry point and platform, a store that can evolve, and later device categories
reserved but refused. Keep sessions token-efficient.

Use `grilling` + `domain-modeling` for HITL tickets, `research` for AFK tickets,
`prototype` for the release-state model. Use `GLOSSARY.md` terms (admission,
device lease, run, attempt, observed outcome, quarantine); change meanings only
through discussion. Read real code from `origin/main` or this branch, never the
stale main checkout. Owner decisions from the Phase 2 charting session
(2026-10-19): destination = implementation-ready; `DeviceLease` stops being an
ownership authority; later device categories are reserved, not enabled;
real-store migration needs a separate owner go-ahead.

## Decisions so far

- [Android emulator provenance](issues/02-emulator-provenance.md): key emulators on the console's `realpath(avd path)` plus category; exact-reply parsing; emulator 30+ with auth token; refuse on conflicts.
- [Named-profile selection contract](issues/01-profile-selection-contract.md): versioned `.jev/profiles.json`, `--profile`/MCP `profile`, explicit > default > legacy order, scenario-only conflicts, budgets only tighten, binding recorded.

## Route

<!-- route:start -->
```mermaid
flowchart LR
    T01["01 Named-profile selection contract<br/><small>grilling</small>"]
    T02["02 Android emulator provenance<br/><small>research</small>"]
    T03["03 Canonical device identity<br/><small>grilling</small>"]
    T04["04 Evidenced release with immutable outcomes<br/><small>prototype</small>"]
    T05["05 Store schema evolution<br/><small>grilling</small>"]
    T06["06 Retiring DeviceLease as an ownership authority<br/><small>grilling</small>"]
    T02 --> T03
    T03 --> T05
    T04 --> T05
    T04 --> T06
    classDef resolved fill:#e4e4e7,stroke:#a1a1aa,color:#52525b
    classDef claimed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef frontier fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef blocked fill:#ffffff,stroke:#a1a1aa,color:#18181b
    class T01,T02 resolved
    class T03,T04 claimed
    class T05,T06 blocked
```
<!-- route:end -->

## Not yet specified

- Import of legacy Android lease files and existing iOS history into the
  upgraded store, and its receipt; depends on identity, schema evolution and
  lease retirement.
- Activation runbook and readiness checklist for the real per-user store
  (writer window, backup, other agents' quiescence).
- Splitting 2A–2D into implementer briefs with token caps, stop rules and
  verification lists (including race tests H01–H03, H11, P3, P4).

## Out of scope

Applying the migration to the real store (separate owner go-ahead), enabling
physical iPhones (Phase 6), physical Android acceptance (Phase 4), allocation
reclamation (Phase 5), and the Appium adapter itself (Phase 3).
