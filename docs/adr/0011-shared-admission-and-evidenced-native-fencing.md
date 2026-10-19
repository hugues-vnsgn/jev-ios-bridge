---
status: accepted
date: 2026-10-12
implementation: not-started
---

# Shared admission and evidenced native fencing

Extend v1.4.0's per-user SQLite admission authority to Android through an explicit offline migration, preserving historical outcomes, quarantines, reservations, exclusions, and receipts. A separate Appium ownership store would recreate the cross-entry-point authority gaps that ADR-0008 addressed. All updated device entry points must share the same admission authority; old binaries and external tools still require operational exclusivity.

Admission authorizes device work; it does not prove that work has stopped. Release the device lease only after durable closure of dispatch, terminal or fenced disposition of every issued command, and verified loss of every owned native automation component's ability to act. A deleted session record, successful cleanup reply, or exited MCP process alone does not establish this. Retain quarantine while evidence is incomplete, including unknown creation without a session ID. Safe cleanup leaves an uncertain action's outcome inconclusive.

This trades immediate device reuse for preserving the existing device-lease guarantee across a longer-lived automation stack. Phase 1 must demonstrate the predicate on an iOS simulator and an Android emulator before the full adapter is built. [The plan](../../.scratch/appium-mcp-migration/plan.md#ownership-recovery-and-allocation-reclamation) records the required evidence and recovery gates; this ADR records an accepted design, not a demonstrated native guarantee.
