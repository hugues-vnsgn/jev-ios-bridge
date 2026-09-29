# The /test-android skill

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: none

## Question

What does the `/test-android` skill say, and how does an author see the screen while writing a script?

- How much it shares with `/test-ios` (`skills/test-ios/SKILL.md`): one shared body with platform notes, or two skills.
- How it captures a screen while authoring: mobilecli directly (it needs the guard environment, and the plugin path rewrite from "mobilecli as a dependency"), or a new bridge command that prints the mapped elements, with the selectors an author can use.
- What it teaches that differs from iOS: `testTagsAsResourceId`, `app.package`, `device.avd`, placeholders, password dots, non-English typing, and the claim notes from "What Jev sees on Android, and the 10-screen check".

## Answer

Resolved 2026-09-29 with the owner; every recommendation accepted. Based on `skills/test-ios/SKILL.md` (45 lines, seven steps) and `scripts/build-plugin.mjs`, which copies the skill into the plugin and rewrites `npx mobilebuildmcp` to the plugin's own path.

1. **Two skills.** A new, self-contained `skills/test-android/SKILL.md` follows the same seven steps with Android details. `/test-ios` is untouched. The plugin ships it as `/jev-ios-bridge:test-android`, and `build-plugin.mjs` copies it with the same kind of path rewrite.
2. **Seeing the screen while authoring:** a new CLI command, `jev-ios-bridge capture`, for Android only in 1.2.
   - It picks the device the way a script does: `--serial`, `--avd`, then `JEV_ANDROID_DEVICE`.
   - It captures the current screen, without launching or restarting the app, and holds the device lock while it does.
   - It cleans up afterwards: mobilecli's daemon, the on-device `DeviceServer`, and the `adb forward`.
   - The skill calls it instead of mobilecli, which would show raw classes without the `scrollable` and `password` flags and need the guard settings and cleanup by hand.
   - iOS may adopt it later.
3. **What `capture` prints:** one JSON line per element (role, label, value, identifier, placeholder, state), with `"selectable": false` on lifted texts. `--jev` prints Jev's text for the screen instead: the Android projection, byte for byte.
4. **Apps without Compose identifiers:** when a capture shows Compose elements with no identifiers, the skill tells the user to add `Modifier.semantics { testTagsAsResourceId = true }` at the root composable (androidMain) and shows where. It doesn't edit or rebuild the app unless asked. Meanwhile it authors `role` plus `label` selectors.
5. **Android notes in the skill,** each linking to its guide page rather than repeating it:
   - **Setup:** `app.package`; `device.avd` for emulators and `device.serial` for phones; `app.activity` and `app.intentExtras` for a stable start screen.
   - **What Jev reads:**
     - `placeholder` on empty fields, so never claim a field "contains" it;
     - dots for password fields;
     - numbers quoted exactly as printed;
     - custom tabs and toggles need a selected or checked state.
   - **Limits:** non-English text types exactly, but Jev's promise covers English screens; real phones are untested.
   - **Trigger:** the description triggers on verifying an Android app (Jetpack Compose, Compose Multiplatform or classic Views) on an emulator or phone.
