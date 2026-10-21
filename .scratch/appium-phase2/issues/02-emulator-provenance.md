# Android emulator provenance

Type: research
Status: resolved
Labels: wayfinder:research
Mode: AFK
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

Which bounded read-only commands reliably identify a running emulator's AVD (name, path, custom root) so same-named or custom-root AVDs cannot alias, and what fails or differs across emulator versions?

## Required investigation or discussion

Primary sources: Android emulator console (`adb emu avd name`, `avd path`), `ro.boot.qemu.avd_name` (used today in `src/device/android/driver.ts`), `ANDROID_AVD_HOME`/`ANDROID_USER_HOME`/`ANDROID_SDK_HOME` resolution, `.ini`/`config.ini` layout. Note availability by emulator version and timing. No device experiments beyond reading docs and source.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.

## Answer

Research resolution, 2026-10-19: identify an emulator through its host-side console, not the guest property. `adb -s emulator-N emu avd name`, `avd id` and `avd path` return name, ID and content directory; `realpath(avd path)` is what separates same-named or custom-root AVDs. Accept only the exact `<value>\r\nOK\r\n` reply (`adb emu` exits 0 on `KO:` too). `avd id`/`avd path` need emulator 30+ and the console auth token; `avd name` works before auth. The console answers while adb still shows `offline`. `pid_<pid>.ini` is optional corroboration (gRPC launches only). Never derive the AVD root from environment variables. Still unknown: exact reply bytes for missing/empty token and `offline`; one live trial confirms them.

[Sourced report](https://github.com/hugues-vnsgn/jev-ios-bridge/blob/research/emulator-provenance/.scratch/appium-phase2/research/emulator-provenance.md), branch `research/emulator-provenance` at `cda2d734a`. It lists eight concrete Phase 2 spec changes for Canonical device identity. No device experiment was run.
