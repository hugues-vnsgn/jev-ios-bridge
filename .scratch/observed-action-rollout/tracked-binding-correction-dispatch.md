# Tracked allocator binding correction

Root dispatch, 2026-10-09. Continues the authorized allocation repair under approved legacy policy v3; no new host trust exception.

## Frozen inputs

Base dcc06dc0939d73d860cae9e03d4f1f47bacbd279 passed the actual unmodified default checks, 2240/2240, on Node26.8.1 and Node24.0.0. Its independent Spec and Standards reviews both FAIL: the real allocator creates an unregistered tracking wrapper, so the private mount/file expectation does not reach the production invoker. Cancellation finding P2 is resolved. Direct-factory tests did not cover this composition.

Reviews: `../observed-integration/acceptance/host/runtime-visibility-2026-10-09/legacy-implementation-review/{spec,standards}/dcc06dc0/`. Root independently rehashed both input/output sets; binding SHA4d6542beedb5d1c179e906131a582694403e43452f0edd6efc64aa4798ef5ce4. Integration HEAD71916ed55469aa86cfe675900edbb9212c3d76f0 still contains accepted Source441. Both earlier author checkouts and sealed evidence stay frozen.

## Author window

Sole author: allocation_tracked_binding. CWD `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/fix-installed-tracked-binding`, branch `fix/installed-tracked-binding`, initial HEADdcc06dc0939d73d860cae9e03d4f1f47bacbd279. Orca instance b8e2c769-1395-4d48-b9ef-c0608d18de75, parent fix-installed-legacy-binding. Preparation receipt `.scratch/installed-tracked-runtime/workspace-preparation.json` SHAe4e5ed0770ec7d903f299a5d052b5867792a9b1d99ec3fdfb785f01ed16e120d verifies443Source/69compiled. Dependencies are an existing readonly symlink; no install or .env.

Exactly four owned Source paths:

- src/observed/allocation-config.ts
- src/observed/allocation.ts
- tests/observed-legacy-volume-runtime.test.ts
- tests/fixtures/observed-legacy-volume-runtime.ts

All other439 Source paths and all existing241 legacy assertions remain protected. Fresh private evidence belongs only under `.scratch/installed-tracked-runtime/` in the new checkout.

## Required correction and evidence

First neutrally extract the current tracking composition into a shared helper and wire the allocator through it. Record genuine failing regressions on both exact Nodes through that same helper before adding identity forwarding. Then preserve registered private invocations through the tracking thunk, mirror the production brand, keep public SourceProcess at three arguments, and retain deferred abort checks, pending tracking and diagnostic success/error handling. Private expectations must never be exposed to the tracking callback. No ambient mutable identity state or proof cache.

Cover both namespaces, all three metadata leaves and inner conversion/bootstrap restoration. Preserve all earlier cases and verify arity, production branding, concurrent isolation and cancellation where relevant. Establish pure fixture isolation before execution. Run focused, coverage, typecheck and build gates, freeze443Source/439protected/69compiled, then run actual unmodified official defaults serially on both exact Nodes with fresh HOST_EVIDENCE_DIR and natural child close. Preserve every failure; do not retry without diagnosis or weaken assertions/timeouts. Earlier4fa Node24 failure remains unexplained.

Return the frozen candidate for independent Spec and Standards review. Describe shared-helper coverage accurately; do not claim a native or full production Allocator run.

## Remaining gates

Both review axes must pass before candidate clean37 npm/plugin and fixed wrapped startup executions. Those require Root's later grant and precede integration. Then exact four-file integration and fresh physical host/distribution gates, sole-operator once iPhone17/iOS27.0 compatibility, operational entry, five serial live cases, and ticket12 independent review. The sole live operator stays idle. No native, SDK, account, migration, app build, secret access, merge, push or publication is granted here. No owner decision is pending.
