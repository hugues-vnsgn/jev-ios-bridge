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

## Comments

**claude-issue-22, 2026-09-30.** Built on `agent/android-v1.2-phase6-issue-22`: 24e7512 (skill, build, manifest, descriptions) and 935c9c7 (review fixes). `npm run check` passes at 935c9c7: 422 of 422 tests, then a clean build. `npm run build:plugin` ran, and `build/plugin/jev-ios-bridge/skills/test-android/SKILL.md` has `node "${CLAUDE_PLUGIN_ROOT}/dist/cli.js" capture` (twice) and `${CLAUDE_PLUGIN_ROOT}/docs/guide/`, with no `npx` or `node_modules` path left. `build/` isn't committed. No device was touched, and mobilecli was never run.

- **What's built:**
  - `skills/test-android/SKILL.md`: the seven steps of `/test-ios` with Android details. It captures with `npx jev-ios-bridge capture --avd <name>` (or `--serial`), and `--jev` for Jev's text. It covers the `testTagsAsResourceId` snippet at the root composable in `androidMain`, `role` plus `label` selectors until that's added, and every Android note from the release spec, each with a guide link. `/test-ios` is untouched.
  - `scripts/build-plugin.mjs`: exports `rewriteSkill(name, text)` and builds both skills through it. The `/test-ios` pairs and error message are unchanged. The build runs only when the script is the entry point, so tests can import it. The header comment and the marketplace description now say iOS and Android.
  - `plugin/plugin.json`: `simulator_udid` is `required: false`, with a description that says it's for iOS. The new optional `android_device` ("Android device", a serial or AVD name) maps to `JEV_ANDROID_DEVICE`. The description and keywords say iOS and Android.
  - `plugin/README.md`: the three settings (two optional), both skills, and each skill's rewrites.
  - `package.json`: the description says iOS and Android. `keywords` is new, because there was none before.
- **Deviations:**
  - New file `scripts/build-plugin.d.mts`, outside the owned list. It is a two-line declaration so `tsc` can type the test's import of the `.mjs` build script; `tsconfig.json` has no `allowJs`.
  - The skill is 72 lines against `/test-ios`'s 45. The extra lines are the Kotlin snippet, the capture command block, and the Android claim notes. The seven steps and the section order match.
- **For phase 7 (open point 15):**
  - The skill links `12-android-setup.md` three times: device naming, `testTagsAsResourceId`, and custom tabs and toggles. Phase 7 must create it under that name.
  - The skill also points at notes phase 7 still has to write:
    - placeholders and exact numbers in `05-writing-claims.md`;
    - password dots in `09-data-handling.md`;
    - non-English text and untested real phones in `10-limits.md`. That page still says "Simulators only…", so it contradicts the skill until phase 7 updates it.
- **Choices left open:**
  - The marketplace description reads "scripted iOS simulator and Android emulator checks judged by Jev". It names emulators only, because real phones are untested.
  - The skill tells the agent to ask the user to bring each screen up before capturing, because `capture` never launches the app.
  - It warns that a `"selectable": false` element never matches a guard or a selector, as `src/scripted/select.ts` does.
  - The skill describes `capture` from the spec (Issue 21 isn't merged): its flags, `--jev`, exit code 3 with the reason code on stderr, and one JSON line per element.
- **Tests added (7):** `tests/plugin.test.ts` (6):
  - the Android rewrite replaces both strings;
  - it throws for a copy missing each string;
  - the `/test-ios` rewrite is unchanged;
  - the manifest's optional settings and env mapping, name, description and keywords;
  - `package.json`'s name, description and keywords;
  - the skill's frontmatter name, its guide links (allowing `12-android-setup.md`), and that it never mentions mobilecli.

  `tests/mcp.test.ts` (1): the real `src/cli.ts mcp` starts with `JEV_DEVICE_UDID=''` and `JEV_ANDROID_DEVICE=''` and lists its three tools. No existing test changed.
- **Review (`/code-review` since 2bc5819):**
  - Standards: no hard violations. I fixed two judgement calls: the declaration now takes `name: string`, and the MCP test moved into `tests/mcp.test.ts`.
  - Spec: no scope creep. I fixed:
    - the placeholder and number notes each get a guide link;
    - two `/test-ios` claim rules are back;
    - the `selectable: false` warning now covers guards;
    - the intro says "emulator or phone";
    - the `@OptIn` hint for older Compose.
