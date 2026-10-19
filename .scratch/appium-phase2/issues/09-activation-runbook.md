# Activation runbook for the real store

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

What exact checklist and order must the owner follow to upgrade, import into and activate the real per-user admission store, and what makes it ready?

## Required investigation or discussion

Graduated from the map's fog after [Store schema evolution](05-store-schema-evolution.md), [Retiring DeviceLease as an ownership authority](06-device-lease-retirement.md) and [Legacy lease import](07-legacy-lease-import.md). The real store is at schema 2 under `~/Library/Application Support/jev-ios-bridge/admission`. Cover: the recorded writer window and how the owner confirms other agents (Codex, other Claude sessions, Orca terminals) are quiescent without the tool stopping them; updating installed v1.4.0 binaries and plugins, which refuse a schema 3 store; the order (upgrade, import, recovery of any active attempts, verification); backup location and what to check; protected devices and unresolved native studies; and what is reported if a step refuses. The runbook is planning; applying it stays a separate owner go-ahead (Out of scope).

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.

## Answer

Owner decision, 2026-10-19 (grilling over two rounds, all recommendations accepted, summary confirmed):

- **Requirements now, runbook text in 2B.** The spec fixes steps, order, checks and stop rules. Package 2B writes the runbook against the commands it builds and updates the public guide.
- **New read-only `admission-maintenance preflight`.** It lists bridge and MCP processes (PID and start time), open store handles, lock files, active attempts and installed bridge plugins with their versions, and stops nothing. `upgrade` and `import` repeat the checks and refuse on a live bridge process, an open handle or a reachable install older than admission. Only the owner asserts `writersStopped`.
- **Order:** quiesce; preflight; recover active attempts with v1.4.0; update or remove every older install; preflight again; upgrade; import; verify.
- **Verification:** read-only status first (schema 3, receipt chain, preserved counts and digests, expected quarantines including protected devices, backup). Then one smoke run the owner approves, on a non-protected simulator and an emulator.
- **Any refusal:** stop, keep everything as it is, report, and never work around it.
- **Records:** full outputs in a private `activation/<date>/` folder in the admission root, plus a short committed summary with no paths.
- **Executor:** the owner, or an agent with the owner's go-ahead for that activation. The agent stops at refusals and never asserts `writersStopped`.
- No glossary term and no ADR.

Spec change: added "Activation runbook requirements" to [the Phase 2 specification](../../appium-mcp-migration/phases/phase-2-ownership.md) and updated the status line. Input added to [Phase 2 package briefs](10-package-briefs.md): preflight and the runbook text are 2B scope.

Facts found on this machine, 2026-10-19 (read only):
- The installed Claude Code plugin is `jev-ios-bridge@jev-ios-bridge` 1.3.0, and the cache also holds 1.2.0. Both predate admission.
- `~/.codex/config.toml` registers this repo as a plugin marketplace.
- The real store is at schema 2 and was last written 2026-10-11.
- The 2026-10-11 activation followed `docs/guide/14-observed-actions.md`; no separate runbook record exists.

Open limits: preflight's process and plugin discovery is best effort (it can't see other OS users or other machines), and the exclusivity limits for old binaries still stand.

