# Map: observed actions from live experiment to agent workflow

Label: wayfinder:map
Created: 2026-10-08

## Destination

An implementation-ready plan for exposing the validated observed-action runner through the agent interface, assigning fresh dedicated simulators, and validating broader unmodified-app flows. The handoff names bounded work packages, dependencies, suitable skills, acceptance evidence, and integration ownership.

## Notes

- Planning only: do not implement product code, operate simulators, merge, or publish in this effort. Task tickets may produce design, contract, and handoff documents to reach this destination; this is an explicit extension of wayfinder's prerequisite-only task convention.
- Owner's standing direction: autonomous parallel agents; keep apps unmodified; verify visible outcomes; report uncertainty honestly. Technical choices may be recommended and resolved within those constraints without a simulated human interview. New product scope or weaker guarantees require an actual owner decision.
- Baseline: `2ae75e5` on `feat/native-callback-diagnostic`; [prior map](../observed-ui/map.md), [live report](../observed-ui/live/report.md), [965-test verification](../observed-ui/integration/verification.md). These are inherited facts, not decisions resolved by this new map.
- Work in the existing isolated worktree. Main checkout has unrelated changes. One writer per ticket; coordinator alone edits this map, shared specifications, and dependency edges.
- All child tickets use `wayfinder:task` or `wayfinder:research`; `Mode: AFK` means delegated technical work, not a human conversation. Never resolve a HITL question by impersonating the owner.
- Consult `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, ADR-0002, ADR-0005, and ADR-0007. Preserve frozen script/verdict/report meanings; an observed outcome is not a Jev pass or a native receipt.
- Dispatch and proposed implementation waves: [agent plan](agent-plan.md).
- Approved models: `gpt-6.1-sol` high for integration/provisioning; `gpt-6-astra` high for admission and independent safety review; `gpt-6.1-sol` medium for routine tests/docs. Existing Orca live worker remains `gpt-6-luna` high.
- Three child agents maximum at once. Parallel planning reads are allowed. Implementation later uses disjoint worktrees and commits; root integrates in dependency order and runs shared checks.
- Live execution belongs to the user-selected Orca pane `b0e5a4b6-106b-4dab-a49a-b3933445d4ef:1b178e31-086e-40c9-b4e2-b9a3dd45ad90`. Only one device operator at a time. Root watches and fixes integration. No live work is dispatched while charting.
- Preserve all existing quarantines and device claims; do not use the three retained live-test devices or the historical study device. Never read, copy, or print `.env` values.
- Skills: `wayfinder` for route changes; `grilling` and `domain-modeling` for scope and language; ticket-specific skills below. Independent `code-review` and `do-test` agents gate the eventual handoff and implementation.

## Decisions so far

- [Establish supported fresh-simulator provisioning](issues/02-simulator-provisioning.md): the pin supports existing-device boot/install but not creation; the inventory-source decision is now explicit.

- [Choose how dedicated simulator inventory is replenished](issues/08-inventory-replenishment.md): bounded creation-only adapter with durable reservations; MobileBuildMCP retains preparation and UI operations.

- [Locate the MCP and reporting integration seam](issues/01-integration-seam.md): one observed-action service shared by additive CLI/MCP adapters; scenario semantics remain separate.

- [Audit admission and quarantine across runners](issues/03-admission-boundary.md): transactional shared admission, non-mutating status, and atomic terminal authority; host diagnosis reproduced both integration hazards.

- [Choose the observed-action public contract](issues/04-public-contract.md): additive versioned allocation/action APIs with key-free execution, authoritative retrieval and explicit cancellation.
- [Define allocation and uncertain-device lifecycle](issues/05-allocation-contract.md): durable bounded creation, single-use allocation, parked handoff, retained uncertainty and a host-wide unknown-create guard.

## Route

<!-- route:start -->
```mermaid
flowchart LR
    T01["01 Locate the MCP and reporting integration seam<br/><small>task</small>"]
    T02["02 Establish supported fresh-simulator provisioning<br/><small>research</small>"]
    T03["03 Audit admission and quarantine across runners<br/><small>task</small>"]
    T04["04 Choose the observed-action public contract<br/><small>task</small>"]
    T05["05 Define allocation and uncertain-device lifecycle<br/><small>task</small>"]
    T06["06 Specify broader live evidence and acceptance gates<br/><small>task</small>"]
    T07["07 Assemble and review the parallel implementation handoff<br/><small>task</small>"]
    T08["08 Choose how dedicated simulator inventory is replenished<br/><small>task</small>"]
    T01 --> T04
    T03 --> T04
    T03 --> T05
    T08 --> T05
    T04 --> T06
    T05 --> T06
    T06 --> T07
    T02 --> T08
    classDef resolved fill:#e4e4e7,stroke:#a1a1aa,color:#52525b
    classDef claimed fill:#dbeafe,stroke:#2563eb,color:#1e3a8a
    classDef frontier fill:#dcfce7,stroke:#16a34a,color:#14532d,stroke-width:2px
    classDef blocked fill:#ffffff,stroke:#a1a1aa,color:#18181b
    class T01,T02,T03,T04,T05,T08 resolved
    class T06 claimed
    class T07 blocked
```
<!-- route:end -->

## Not yet specified

No unclassified fog currently. Public schema, allocation state, validation coverage and implementation partitioning are explicit child-ticket questions. Add a ticket if investigation exposes a new prerequisite; do not hide it inside implementation.

## Out of scope

- Implementing, merging, publishing, or live-running the feature during charting.
- Native ownership, settlement, or contact-consumption/release certification; the 23 older tickets remain separate.
- Automatic replay, clearing uncertain claims by age/PID, modifying target apps for instrumentation, or new device transports without a separately justified decision.
- Physical devices, Android observed actions, broad gestures/typing, and general autonomous navigation in the first integration.
