# Activation runbook for the real store

Type: grilling
Status: claimed
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
