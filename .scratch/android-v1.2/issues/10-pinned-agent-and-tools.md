# Phase 4: the pinned agent and the tools

Status: closed
Closed: Merged into agent/android-v1.2-phase4 at 96d93c6
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

## Comments

### 2026-09-30, claude-issue-10

**What I built** (`9817515`, review fixes in `53d568f`):
- `mobilecli` is now pinned at exactly `1.0.14` in `dependencies`. `package-lock.json` pins it and its platform packages at 1.0.14. No platform package is listed directly.
- `src/device/android/agent-supply.ts` provides `pinnedAgent({ readProgram?, cacheFolder?, pinnedSha256? })`, returning `{ path, sha256 }`, along with `PINNED_AGENT_SHA256` and `mobilecliProgramPath()`.
  - It finds `@mobilenext/mobilecli-darwin-<arch>` from mobilecli's own `package.json` and reads the program without running it.
  - It requires exactly one DEX whose `dex\n0NN\0` header, length field, Adler-32 checksum and SHA-1 signature are all valid, then checks that DEX against the pinned SHA-256.
  - It caches the DEX at `$TMPDIR/jev-android-agent/<sha256>.dex`, with the folder at 0700 and the file at 0600. It writes a temporary file and then renames it into place.
  - It re-hashes the cache on every call and rewrites it when the hash doesn't match.
  - Every failure throws `DeviceReasonError('ANDROID_TOOLS_UNAVAILABLE')`.
- `src/device/android/tools.ts` provides three functions:
  - `findAdb({ environment?, home? })` looks in `ANDROID_HOME`, `ANDROID_SDK_ROOT` and `PATH`, in that order.
  - `adbEnvironment()` calls `deviceEnvironment()`, which strips the key and keeps `ANDROID_ADB_SERVER_PORT`.
  - `androidTools(options)` is the tools check: `adb` first, then the agent. It returns `{ adb, agent }`, and Issue 14 calls it before the device lookup.

**Open-point defaults used:** open point 3's full order, including the last fallback `~/Library/Android/sdk/platform-tools/adb`, because the Issue says "as the open point orders them".

**Deviations and small choices:**
- `pinnedSha256` is a test-only option, since synthetic bytes can't carry the real hash. Issue 14 shouldn't pass it through.
- `findAdb` skips empty and relative `PATH` entries, and skips an `adb` that isn't an executable file.
- `pinnedAgent` always reads the program, even when the cache is valid, so a missing package is always reported.
- A cache folder owned by another user fails closed, because its chmod fails.

**Tests added:**
- `tests/android-agent-supply.test.ts` (8 tests):
  - one valid DEX, found and cached with the right modes;
  - none, or two;
  - a bad Adler-32, a bad SHA-1 or a bad length field, plus broken copies next to a valid one;
  - a wrong SHA-256;
  - a missing program;
  - a tampered cache, which is rewritten and reset to 0600;
  - a cache folder that can't be created;
  - the real installed package: one DEX of 72,660 bytes with the pinned SHA-256. This one is skipped when the Mac package is absent.
- `tests/android-tools.test.ts` (7 tests):
  - the `adb` lookup order;
  - a missing `adb`, an `adb` that isn't executable, one that is a folder, and relative `PATH` entries;
  - `adbEnvironment()`;
  - `adb` reported before the program is read;
  - a missing program;
  - a spy on every `child_process` spawn function during the real tools check, asserting zero calls. It runs on Linux too, where it asserts the refusal. I checked that it fails when a spawn is added;
  - a source scan showing that nothing in `src/` imports mobilecli's JavaScript.

**Gate:** `npm run check` passed at `53d568f`: 257 of 257 tests, typecheck and build. `/code-review` against `166ddbd` found no hard violation and no missing requirement. I fixed the Linux-skipped spawn spy and the duplicated path logic in the tests. No device was touched.
