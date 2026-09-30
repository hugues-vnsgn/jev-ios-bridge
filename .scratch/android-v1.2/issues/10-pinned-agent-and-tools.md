# Phase 4: the pinned agent and the tools

Status: claimed
Claimed by: claude-issue-10
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) item 1, and [open point 3](../../android-support/release-spec.md#open-points-for-the-executor). Read them in full. The detail below only adds acceptance criteria.

## What to build

New code goes in `src/device/android/`.

1. **The dependency.** Add `"mobilecli": "1.0.14"` (exact) to `dependencies`. Don't list its platform packages directly: that breaks `npm install` on Intel Macs. Check that `package-lock.json` pins 1.0.14.
2. **`pinnedAgent()`**, the agent supply:
   - resolve `@mobilenext/mobilecli-darwin-<arch>` from mobilecli's own location, and read the program file. **Never execute it.**
   - Find the DEX files inside by their `dex\n0NN\0` header. Require exactly one whose length field, Adler-32 checksum and SHA-1 signature are all valid.
   - Check its SHA-256 against the pinned constant `0e0865d0617bc6e4abf0a7b24a956da1ca25cfc795c30d8e32c64eb0d1f6258f`.
   - Cache it as `$TMPDIR/jev-android-agent/<sha256>.dex` (folder 0700, file 0600). Re-check the cached file's hash on every run, and rewrite a cache file that doesn't match.
   - Any failure (package missing, no valid DEX, two valid DEX files, a bad checksum or signature, a wrong SHA-256, an unreadable cache) is a `DeviceReasonError` with `ANDROID_TOOLS_UNAVAILABLE`.
   - Take the file reader and the cache folder as options, so tests use synthetic bytes and a temporary folder.
3. **Finding `adb`** (open point 3): `ANDROID_HOME`, then `ANDROID_SDK_ROOT`, then `PATH`, as the open point orders them. Not found is `ANDROID_TOOLS_UNAVAILABLE`.
4. **`adbEnvironment()`** builds on `deviceEnvironment()` (`src/device/index.ts`), which already strips `TYPESAFE_API_KEY`, and keeps `ANDROID_ADB_SERVER_PORT`, so the private adb server is used.
5. **One tools check** (`adb` found, then the agent) that the driver runs before the device lookup, so a missing tool is reported first. Issue 14 calls it; this Issue exports it and tests it.

## Acceptance

- Tests with synthetic program bytes: one valid DEX (found and cached), none, two, a bad Adler-32, a bad SHA-1, a wrong SHA-256, and a tampered cache file (detected and rewritten, or refused).
- A test with the real installed package, skipped when `@mobilenext/mobilecli-darwin-<arch>` isn't present (CI on Linux has only the linux package): it finds exactly one DEX, 72,660 bytes, with the pinned SHA-256.
- Tests for the `adb` lookup order and for `adbEnvironment()` (the key stripped, `ANDROID_ADB_SERVER_PORT` kept).
- A test asserts that no runner or spawn is ever asked to execute the mobilecli program.
- Nothing in `src/` imports anything from mobilecli's JavaScript; the package is only a place to read the program from.
- No existing test changes. `npm run check` passes. No device is touched.
