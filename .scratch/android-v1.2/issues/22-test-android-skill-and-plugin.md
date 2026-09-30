# Phase 6: the `/test-android` skill and the plugin

Status: claimed
Claimed by: claude-issue-22
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 6". The work is [the release spec's phase 6](../../android-support/release-spec.md#phase-6-the-capture-command-the-test-android-skill-and-the-plugin-the-test-android-skill-how-a-script-names-an-android-app-and-device-default-device) items 2 to 4, with [open points 13 and 14](../../android-support/release-spec.md#open-points-for-the-executor), and the answer in [The /test-android skill](../../android-support/issues/10-the-test-android-skill.md). Read them in full. The detail below only adds acceptance criteria.

## Files this Issue owns

- `skills/test-android/SKILL.md`;
- `scripts/build-plugin.mjs`;
- `plugin/plugin.json`;
- `plugin/README.md`;
- the `description` and `keywords` in `package.json`;
- new tests.

Don't touch `src/cli.ts` or `src/device/`: Issue 21 changes them.

## What to build

1. **`skills/test-android/SKILL.md`**, self-contained. It mirrors `skills/test-ios/SKILL.md`'s seven steps, structure and rough length, with Android details:
   - **Capturing screens:** it captures each screen with `npx jev-ios-bridge capture --avd <name>` (or `--serial`), passed explicitly, and `--jev` for Jev's text. `capture` is being built in parallel (Issue 21): write to the spec's description of it.
   - **Missing identifiers:** when Compose elements have no identifiers, it tells the user to add `Modifier.semantics { testTagsAsResourceId = true }` at the root composable (`androidMain`) and shows where. It doesn't edit or rebuild the app unless asked, and meanwhile it writes `role` plus `label` selectors.
   - **Android notes:** the notes the release spec lists, each linking to its guide page.
     - **Pages that exist today:** use their current names.
     - **Pages phase 7 will add:** `docs/guide/12-android-setup.md` (open point 15). Link to it by that name, and list it in your Issue comment so phase 7 creates it.
   - **Trigger:** the description triggers on verifying an Android app (Jetpack Compose, Compose Multiplatform or classic Views) on an emulator or phone.
   - **mobilecli:** never mentioned.
   - **Writing:** use the `writing-for-agents` skill, then `unslop`.

   `/test-ios` is untouched.
2. **`scripts/build-plugin.mjs`** also copies the Android skill, with the open point 13 rewrites:
   - `npx jev-ios-bridge capture` becomes `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture`;
   - `node_modules/jev-ios-bridge/docs/guide/` becomes `${CLAUDE_PLUGIN_ROOT}/docs/guide/`.

   It throws when an expected string is missing. Extract the rewrite into a function the tests can call, if that reads better. Update the header comment and the marketplace description to say iOS and Android.
3. **`plugin/plugin.json`:**
   - `simulator_udid` becomes `required: false`, with a description that says it's for iOS.
   - A new optional `android_device` setting ("Android device": a serial or an AVD name) goes to `env` as `JEV_ANDROID_DEVICE`.
   - The description and keywords say iOS and Android. The name stays.
4. **`plugin/README.md`:** the two optional settings, the second skill, and the build.
5. **`package.json`:** the description and keywords say iOS and Android. The name stays.

## Acceptance

- **The skill's rewrite:** a test runs it on the real skill (both strings replaced) and on a copy missing each string (it throws).
- **The plugin's manifest:** a test reads `plugin/plugin.json` for `simulator_udid.required === false`, the new setting, and `JEV_ANDROID_DEVICE` in `env`.
- **An empty device setting:** a test starts the MCP server with `JEV_DEVICE_UDID=''` and `JEV_ANDROID_DEVICE=''` and lists its tools. The prior art is `tests/mcp.test.ts` and `tests/fixtures/mcp-server.ts`. Leave the iOS CLI's handling of an empty `JEV_DEVICE_UDID` as it is.
- **The skill:** a docs-style test checks that every guide link in it exists, allowing `12-android-setup.md` until phase 7 adds it, that it never says `mobilecli`, and that its frontmatter `name` is `test-android`.
- `npm run build:plugin` runs, and `build/plugin/jev-ios-bridge/skills/test-android/SKILL.md` has the plugin paths. Don't commit `build/`.
- `npm run check` passes. No device is touched.
