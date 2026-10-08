---
status: accepted
date: 2026-10-08
---

# A bounded fresh-simulator creation exception

Pinned MobileBuildMCP can prepare existing simulators but cannot create them. Autonomous observed-action testing will use a narrow host adapter for `xcrun simctl create`, with explicit device type/runtime and an argument array. This amends ADR-0002's operator-only provisioning responsibility; it adds no UI input transport or app instrumentation. Boot, install, launch, input and visible captures remain with the pinned provider. [Primary command evidence and alternatives](../../.scratch/observed-integration/evidence/inventory-decision.md).

Reserve action identity and resource capacity before creation. Persist creation intent and its host-wide guard before dispatch; bind one valid returned UUID durably before preparation. An uncertain create retains capacity and blocks new updated iOS admissions when device identity is unknown. Never infer ownership from a name or retry automatically. Retain all allocated devices, including successes; this exception permits no clone, erase, deletion, shutdown or runtime download.

The allocation contract supplies finite budgets, compatible immutable app artifacts, readiness and parked ownership transfer. Creating another device cannot authorize replay of an uncertain action. Operators supply installed host/runtime prerequisites; the bridge owns bounded observed allocation. ADR-0007 continues to govern presentation and its existing point-tap UI exception. [Allocation contract](../../.scratch/observed-integration/evidence/allocation-contract.md); [rollout](../../.scratch/observed-integration/spec.md). Acceptance remains pending implementation.
