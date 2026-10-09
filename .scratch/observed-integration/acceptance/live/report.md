# iOS 27.0 runtime confirmation recheck — UNVERIFIED_RUNTIME_ABSENT_IN_INSPECTED_ROOTS

Captured 2026-10-09T01:09:56.504Z. This is a bounded read-only metadata recheck.

## Runtime verdict

No iOS 27.0 .simruntime bundle was found in the allocator-supported installed metadata roots. The default root query returned a scoped missing-root result; the per-volume root and bundle searches returned no runtime bundle. Exact runtime version/build/identifier and runtime-side iPhone 17 compatibility remain UNVERIFIED. This says nothing about unmounted archives, image catalogs, or other uninspected locations.

Required runtime identifier: `com.apple.CoreSimulator.SimRuntime.iOS-27-0`.

## Scope and status

L01–L05 remain **UNVERIFIED**. The owner confirmation resolves the stated writer/root facts as an owner assertion, but this recheck performed no migration, production store/configuration/journal/lease access, bridge/CLI/MCP backend work, tests, builds, simulator listing, runtime installation/download/update/substitution, allocation, launch, capture, input, or cleanup. No fallback was used.

## Evidence

Exact fresh argv, cwd, start/end timestamps, exit/signal, stdout/stderr, plist projections and hashes (if present), and explicit query limits are in `versions.json`. Prior unrelated host/device-type metadata is referenced there by evidence path and SHA-256, not represented as freshly queried. Query child environments removed TYPESAFE_API_KEY, NODE_OPTIONS, and NODE_NO_WARNINGS without reading or printing their values.
