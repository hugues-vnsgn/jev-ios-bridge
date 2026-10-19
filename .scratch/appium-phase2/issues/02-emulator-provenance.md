# Android emulator provenance

Type: research
Status: open
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
