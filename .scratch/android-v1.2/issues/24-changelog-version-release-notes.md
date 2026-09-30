# Phase 7: CHANGELOG, version, and release notes

Status: claimed
Claimed by: claude-issue-24
Blocked by: none (phases 5 and 6 merged in)

Spec: [../spec.md](../spec.md), "Phase 7". The work is [the release spec's phase 7](../../android-support/release-spec.md#phase-7-docs-version-and-changelog-assemble-the-v120-spec-guide-pages-the-answers-named-per-item) items 9 and 10, plus the owner's clipboard ruling for the release notes. Read the CHANGELOG's 1.1.0 and 1.0.0 entries and `docs/releases/v1.1.0.md` for shape and voice.

## Files this Issue owns

- `CHANGELOG.md`;
- `package.json` and `package-lock.json` (the version only);
- `docs/releases/v1.2.0.md`;
- any test or golden entry that pins the version string.

Don't touch `docs/guide/` or `README.md`: those belong to Issue 23.

## What to build

1. **`CHANGELOG.md` 1.2.0.**
   - **Added:** Android support (the device agent, the device lease across platforms, the Android script fields), the `capture` command, `/test-android`, the new reason codes, and the new report and event fields.
   - **Changed:** the reworded codes and descriptions, and the optional simulator setting in the plugin.
   - **"Upgrading from 1.1":** nothing to change for iOS scripts.

   Read the merged code and Issues 03 to 22 so every item is true.
2. **Version 1.2.0** in `package.json` and the lockfile. Update whatever pins `1.1.0` as the current version (the `--version` and MCP server-info tests), and nothing that records history.
3. **`docs/releases/v1.2.0.md`**, shaped like v1.1.0's.
   - Include the clipboard note, "real Android phones are untested", and the install lines for 1.2.0.
   - Leave phase 8's numbers as clear placeholders, for example `<!-- phase 8: check 3 durations -->`.
4. **`unslop`** over the CHANGELOG entry and the notes.

## Acceptance

- `npm run check` passes. `node dist/cli.js --version` prints `1.2.0`.
- No existing golden entry changes except a version string that the 1.1.0 bump also changed.
- No device is touched.
