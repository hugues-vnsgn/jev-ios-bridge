# Live acceptance prerequisite recheck — UNVERIFIED

Captured 2026-10-09. Bounded read-only metadata queries only.

## iOS 27.0 runtime

No iOS 27.0 .simruntime bundle was found in the allocator-supported metadata roots. The default root query returned a scoped missing-root/empty result; the per-volume runtime-root and bundle searches found no iOS 27.0 bundle. This is a scoped negative only and says nothing about unmounted archives or image catalogs.

- Required runtime identifier: `com.apple.CoreSimulator.SimRuntime.iOS-27-0`.
- Exact runtime version/build and runtime profile compatibility: **UNVERIFIED**; no matching runtime plist was available to inspect.
- iPhone 17 metadata is present. Its profile declares minimum runtime 26.0 and default range 26.0–99.99, so device-type metadata includes 27.0; runtime-side compatibility remains **UNVERIFIED**.
- Host metadata: macOS 27.0.1 (26A434), Xcode 27.0 (27A266a), arm64, Node v26.8.1.

## Live rows and scope

L01–L05 remain **UNVERIFIED**. No tests, builds, device backend, simulator listing, runtime download/install/update, production configuration/store/journal/lease access, migration, allocation, launch, capture, input, or cleanup was performed. No fallback was used.

Operational old-writer quiescence and historical journal/lease root declarations or exclusions remain pending, as do production migration/configuration/capacity/storage and fresh app builds.

## Evidence

Exact argv, cwd, timestamps, exit status, stdout, stderr, plist hashes, and projections are in `versions.json`. The query environment removed TYPESAFE_API_KEY, NODE_OPTIONS, and NODE_NO_WARNINGS without reading or printing their values.
