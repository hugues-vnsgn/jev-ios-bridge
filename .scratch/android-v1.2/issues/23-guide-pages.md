# Phase 7: the guide pages

Status: closed
Closed: Merged into agent/android-v1.2-phase7 at 01477df
Claimed by: claude-issue-23
Blocked by: none (phases 5 and 6 merged in)

Spec: [../spec.md](../spec.md), "Phase 7". The work is [the release spec's phase 7](../../android-support/release-spec.md#phase-7-docs-version-and-changelog-assemble-the-v120-spec-guide-pages-the-answers-named-per-item) items 1 to 8, plus the owner's clipboard ruling, and the pages Issue 22's comment lists. Read them in full, and read the code the pages describe; the code wins where a spec sentence and the code disagree. Say where that happened.

## Files this Issue owns

- `docs/guide/`, including `reference/`;
- the root `README.md`;
- `docs/architecture.md`;
- `tests/docs.test.ts`.

Don't touch `CHANGELOG.md`, `package.json` or `docs/releases/`: those belong to Issue 24.

## What to build

1. **`docs/guide/12-android-setup.md`**, with every point in item 1.
2. **Items 2 to 8,** each on the page the release spec names.
   - **The quickstart's Android section** runs twin-fail from `examples/diagnostic-app-android/scenario.json`, which Issue 25 writes, through `/test-android`, and expects **failed** on the $3 total.
   - **`capture`** is documented in `06-running.md`, with its flags, output and exit codes as built.
   - **The clipboard ruling** goes in `reference/script-format.md`.
3. **Remove Issue 22's allowance** in `tests/docs.test.ts` for the missing `12-android-setup.md` (or wherever it lives), and add the new page to whatever list the docs test keeps.
4. **Links:** shipped docs link inside the tarball by relative path. Anything else is linked by its GitHub URL at `v1.2.0`.
5. **`unslop`** over every page you touched.

## Acceptance

- `tests/docs.test.ts` passes, covering the new page and every reason code in `src/scripted/vocabulary.ts`.
- No iOS instruction changed meaning. Where a sentence was iOS-only and is now false, it now covers both platforms.
- The skill's links (`skills/test-android/SKILL.md`) all resolve.
- `npm run check` passes. No device is touched.

### 2026-09-30, claude-issue-23: built, ready for the coordinator

**What I built** (commits `7fc3058`, `b56d4a7`, `2df0314`):
- **`docs/guide/12-android-setup.md`**, covering every point of item 1:
  - `adb` and where it's looked for;
  - API 31;
  - an arm64 image on Apple silicon;
  - naming the device (`device.avd`, `device.serial`, `JEV_ANDROID_DEVICE`, the plugin's Android device setting) and the lease keyed by device identity;
  - `testTagsAsResourceId`, with the `androidMain` snippet;
  - custom tabs and toggles (`selectable`, `toggleable`);
  - animations off as an option, and that the bridge changes no settings (with the settle rule);
  - `pm grant`;
  - the Xiaomi setting;
  - screen lock set to None, and `DEVICE_LOCKED` (open point 16);
  - other UI tools and `DEVICE_BUSY`.
- **Items 2 to 8, each on its named page:**
  - **Quickstart:** a new Android section. It builds and installs the twin, sets the plugin's Android device, then runs `/jev-ios-bridge:test-android` on `examples/diagnostic-app-android/scenario.json`, expecting **failed** on `Total: $3`.
  - **Claim writing:** rules 9 (numbers exactly as printed) and 10 (never "contains" a hint).
  - **Troubleshooting:** a new "Android devices" section with every Android code. It also has the crash commands, "Screen still changing", `DEVICE_BUSY` from a foreign agent, `vendorCode` `adb` or `agent`, and a by-hand clean-up of a leftover agent or forward.
  - **Limits:** every point of item 5. The speed table has `_[phase 8]_` placeholders.
  - **Data handling:** the log file, password dots, intent extras, the clipboard, and no mobilecli.
  - **Reference pages:**
    - `script-format.md`: "How Android types values" (the clipboard ruling) and an Android example;
    - `report-json.md`: the five Android fields, and where the device is recorded;
    - `reason-codes.md`: the Android `DEVICE_ERROR` sentence.
  - **`06-running.md`:** "Capture an Android screen", with the options, behaviour, output (lines from the real twin fixture) and exit codes. It also covers `/test-android`, the MCP setup without the plugin, the Android log pane, and the lease on Android.
  - **Stability:** "What 1.2 added" (the stable parts of `capture`, and that element lines may gain fields), the mobilecli pin, and `android-full-text-v1`.
  - **Guide index, `02-prepare-your-app.md`, the root `README.md`, `docs/architecture.md`:** each updated, and each links the Android page where item 8 asks.
- **Tests:** Issue 22's allowance is removed. `unslop` ran over every touched page.

**Deviations and choices, and why:**
1. **The allowance lived in `tests/plugin.test.ts`,** not `tests/docs.test.ts`, so I removed it there, as the Issue allows ("or wherever it lives"). No other line of that file changed.
2. **I also edited `03-identifiers.md`, `04-writing-scripts.md` and `07-reports-and-evidence.md`,** which items 2 to 8 don't name, because they carried iOS-only sentences that are now false. For example, "See what the bridge sees" named only mobilebuildmcp, and typing allowed only US-keyboard text. `examples/*.md` changed only in link tags. All of these are under `docs/guide/`, which this Issue owns.
3. **The version strings moved to 1.2.0:** the quickstart's download, `--version` comment and clone tag, and the root README's install. The bump in `package.json` is Issue 24's, so until it merges, the `# 1.2.0` comment is ahead of the package.
4. **GitHub links are at `v1.2.0`,** as the Issue asks (item 4). This includes the README's and the examples' old `v1.0.0` links. The README's release-notes link now points at the `docs/releases/` folder, because `v1.2.0.md` is Issue 24's and a new test checks that every linked path exists in the checkout.
5. **The quickstart describes `scenario.json` from phase 8's check 3 row,** because Issue 25 hasn't written it yet. It also has a terminal alternative (`JEV_ANDROID_DEVICE=<AVD> … run`, exit 1) and a pointer to `capture`. Check 10 should confirm that step 4 (setting **Android device** through `/plugin`) works as written. The iOS text already says settings change there.
6. **Where the code won over a spec sentence:**
   - The crash command is written `adb -s <serial> logcat -b crash -d`, with a serial, as every other command on the page.
   - An empty field with no other name also takes its hint as `label` (`mapping.ts:85`), so the docs say a `label` selector finds it. The "never claim it contains its hint" rule stays.
   - `capture` skips the installed-app check.
   - Intent extras are masked only for a script value, or a `password` or `token`-like key (`src/log/index.ts:59`).
   - `11-stability.md` says only the descriptions of `NO_DEVICE`, `INVALID_DEVICE` and `DEVICE_BUSY` were reworded, and no iOS error message changed.
   - A Compose `Tab` maps to `button` with `selected` in its state, not to role `tab`, and the docs say so.
7. **"Lock" and "lease":** new text says "device lease". The existing heading "Cancelling and the device lock" stays, because it is linked from other pages, and "lock file" names the file on disk.
8. **Settling:** the docs describe the settle rule from `settle.ts` (captures at least 250 ms apart, a 3 s cap).

**Tests added** (all in `tests/docs.test.ts`; no assertion of an existing test changed):
- heading anchors in shipped-doc links resolve;
- repo links in the guide and README are at `v1.2.0`, and each linked path exists;
- the guide index links every numbered page and reference page, `12-android-setup.md` exists, and `02-prepare-your-app.md` links it;
- the setup page covers each point of item 1;
- each reason code's meaning in `reason-codes.md` equals `REASON_CODES`;
- troubleshooting names every code in the Android section of `reason-codes.md`, the two crash commands, "Screen still changing", `forward --remove`, and the agent's `CLASSPATH`;
- `report-json.md` lists every field of the golden iOS and Android reports;
- `06-running.md` documents `capture` with every option in the CLI's usage line, `JEV_ANDROID_DEVICE`, and `"selectable": false`;
- `script-format.md` states the clipboard ruling;
- every whole example script in the guide parses with `parseScriptedScenario`.

**Review** (`/code-review`, fixed point `17fb0c5`):
- **Standards:** 0 hard violations and 9 judgement calls. Fixed in `2df0314`:
  - "lock" wording in new text;
  - "settled snapshot" used for the capped case in `architecture.md`;
  - a link landing in the wrong troubleshooting section;
  - a test named after a spec item number.

  I also tried putting `guidePage` in the old tests, then reverted it, so the pre-phase-7 tests stay untouched.

  Kept on purpose:
  - the `_[phase 8]_` placeholders, which phase 9 fills;
  - the short Android notes repeated on several pages, each one line with a link;
  - the test that reads `src/cli.ts`'s usage line as text, because `cli.ts` runs `main()` on import.
- **Spec:** nothing missing and no scope creep. It found 4 sentences the code contradicts, all fixed in `2df0314` (choice 6: stability's "messages", placeholder selectors, capture's device checks, intent-extras masking).

**Gate:** `npm run check` passed, 522 of 522 tests, then the build, at `2df0314` (log: `$TMPDIR/implement-phase7-23-check.log`). No device, adb server or mobilecli was touched.

### 2026-09-30, coordinator: accepted

Accepted, including the edits to pages 03, 04 and 07, which had iOS-only sentences that were now false. Coordinator follow-ups after merging: the CHANGELOG links the setup page, and the README links `docs/releases/v1.2.0.md`. Check 10 confirms the quickstart's Android step 4 (setting the Android device through `/plugin`).
