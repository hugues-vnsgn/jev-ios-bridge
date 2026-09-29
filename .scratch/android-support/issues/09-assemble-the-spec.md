# Assemble the v1.2.0 spec

Type: task
Status: open
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 10

## Question

Write `.scratch/android-support/release-spec.md` from the resolved tickets: phases with one PR each, ADR-0006 (mobilecli as the Android device layer, with its licence trade-off), the contract additions, the guide pages, the `/test-android` skill, and the release gates. Written for Claude Code as the executor. A fresh-agent review before handoff.

Known inputs so far:

- **Contract additions:**
  - the `platform`, `app.package`, `app.activity`, `app.intentExtras`, `device.serial` and `device.avd` script fields;
  - `JEV_ANDROID_DEVICE`;
  - the projection rule `android-full-text-v1`, and a `placeholder` field in the Android view;
  - new reason codes: device checks from "How a script names an Android app and device", and `APP_NOT_RESPONDING`;
  - typed values may start with `-` on Android;
  - the report records a field's shown value after typing.
- **Guide pages:**
  - an Android setup page: `testTagsAsResourceId`, which apps without it lack entirely; custom Compose tabs and toggles must expose selected or checked state; animations off is optional and faster; `pm grant` for permission dialogs; the Xiaomi input setting;
  - claim-writing notes: quote numbers exactly as the app formats them, and never claim that an empty field "contains" its hint;
  - troubleshooting entries: `adb logcat -b crash -d` and `dumpsys activity exit-info <package>`;
  - the limits page: going to HOME isn't detected, and an upper-case copy of a value isn't masked;
  - how the quickstart changes.
- **New CLI command:** `jev-ios-bridge capture` (Android only in 1.2; `--serial`, `--avd`, `--jev`), from "The /test-android skill".
- **Skill:** `skills/test-android/SKILL.md` as settled in "The /test-android skill", plus the `build-plugin.mjs` copy and path rewrite.
