# Assemble the v1.2.0 spec

Type: task
Status: resolved
Claimed by: subagent (owner session, 2026-09-29)
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

## Answer

Resolved 2026-09-29; the owner accepted the spec.

- **The spec:** [`release-spec.md`](../release-spec.md), 388 lines, written by a subagent from every ticket's Answer and shaped like `.scratch/v1-release/release-spec.md`. It has nine phases, one PR each:
  1. ADR-0006;
  2. refactors that change nothing for iOS;
  3. contract additions;
  4. the Android driver;
  5. the log pane and app exit;
  6. `capture`, `/test-android` and the plugin;
  7. docs;
  8. release checks;
  9. records and publish.
- **Review:** [`spec-review.md`](../spec-review.md), a fresh-agent review against the Answers. It found 29 points (2 blockers, 13 should-fix, 14 minor), all handled or argued in its table.
  - Blocker 1: a new reason code would have changed an iOS golden report. The fix is a pass-through allowlist, plus a test.
  - Blocker 2: Android scripts can't validate without widening the MCP input schema (owner decision A).
  - The reviewer also confirmed that the prototype's 10 captures re-render, byte for byte, into the texts Jev judged.
- **Owner decisions accepted (A to F):**
  - A: the MCP input schema widens, only accepting more.
  - B: one mobilecli home per run, which amends "mobilecli as a dependency".
  - C: the new report fields appear on Android runs only.
  - D: `shownValue` and `typedFields` go into `report.json`.
  - E: nine new reason codes and `capture`'s exit codes 0/3 become permanent.
  - F: a later change to Android's view, or to the Jev model, re-runs the 10-screen check with zero confidently wrong answers allowed.
- **Also accepted:** the recommended defaults for all 21 open points.
