---
status: accepted
date: 2026-10-19
implementation: not-started
---

# Forward-only offline admission store upgrades

The per-user admission store changes schema only through an explicit offline `admission-maintenance upgrade` step, never when a binary opens it. Each binary opens exactly one schema version and refuses any other. An automatic upgrade could run while other agents hold devices, with no writer window or backup. A readable version range would let an older binary ignore quarantines or fence receipts it cannot interpret, and so judge a quarantined device available, which would amount to a second authority. The trade-off is that every schema change needs an operator step and updated binaries everywhere: after an upgrade, installed older plugins refuse the store until they are updated.

Upgrades go forward only. The tool takes and verifies a backup, appends a receipt per step, and offers a checked recovery for an interrupted step. There is no downgrade, because a store that has recorded new work cannot go back without losing it. This extends [ADR-0008](0008-durable-ios-admission.md) and [ADR-0011](0011-shared-admission-and-evidenced-native-fencing.md). [The Phase 2 specification](../../.scratch/appium-mcp-migration/phases/phase-2-ownership.md#store-schema-evolution) holds the details.
