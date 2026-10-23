# Device effects on the private pair

Evidence-only throwaway prototype. The owner decides allowed effects and recovery. Base `6cd87c556bd843d0bdd52d26ba0e392e53945132`. No adapter, production, or test code changed.

Each table compares direct readings before create, while active, and after delete or child kill. These are three snapshots, not continuous monitoring. ABSENT means the key or row was missing. Same means all parsed entries matched. A changed background setting is a temporal difference, not proof that Appium caused it. Raw command arguments, outputs, screenshots, profiles, ownership, and process exits remain in the local evidence folder.

Raw evidence `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P17-evidence`. Scripts `/tmp/p17/`. Canonical decision trail `P17-evidence/workflow.md`.

[Read the findings and recovery observations](findings.md).

## Cases

- [android first-minimum](android-first-minimum.md).
- [android second-minimum](android-second-minimum.md).
- [android skip-provisioned](android-skip-provisioned.md).
- [android unclean-child](android-unclean-child.md).
- [ios skip-log-capture](ios-skip-log-capture.md).
- [ios default-log-capture](ios-default-log-capture.md).

## Scope and reading limits

Android uses the report minimum effects profile without `appPackage`, `appActivity`, or `app`. The first and second sessions allow server installation. The third and fourth add `skipServerInstallation=true`. All use `skipDeviceInitialization`, `skipUnlock`, `autoLaunch=false`, `skipLogcatCapture`, `suppressKillServer`, `autoGrantPermissions=false`, and `mjpegServerPort=0`.

iOS uses a private child HOME, `connectHardwareKeyboard=false`, `simulatorPasteboardAutomaticSync=system`, `noReset=true`, and `autoLaunch=false`, with no `bundleId` or `app`. `isHeadless` matches the observed UI client state. The first session sets `skipLogCapture=true`; the second omits it. No real HOME, physical phone, reset, erase, reboot-persistence, other UI-client state, or failure-to-write-hidden-API branch was tested.

The keyboard and WDA were already changed or installed by earlier private-pair experiments. Unchanged keyboard values do not prove that WDA skips writing them. The unsupported Android `dumpsys activity instrumentation` output is retained but unused; `ps -A` provides the native automation evidence. No continuous monitor proves absence of every transient foreground change.
