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

## Comments

### 2026-09-30, claude-issue-24: built, ready for the coordinator

**What I built** (commits `a6f3a5a`, `126057a`, `57163a8`):
- **Version 1.2.0** in `package.json` and `package-lock.json`, through `npm version --no-git-tag-version`. Nothing that records history changed: `docs/releases/v1.1.0.md` and `.claude-plugin/marketplace.json` stay at 1.1.0, and phase 9 updates the marketplace.
- **`CHANGELOG.md` 1.2.0:** Added, Changed and "Upgrading from 1.1", each item checked against the merged code and Issues 03 to 22.
- **`docs/releases/v1.2.0.md`,** shaped like v1.1.0's. It has the install lines for 1.2.0, a "Know before you start" section (real phones untested, the clipboard ruling, English screens, Apple silicon only), and "Checked before release" with one placeholder per phase 8 check.
- **`unslop`:** the checker found no tells in either text. By hand, I cut one unverifiable line ("you're the first to try one").

**Deviations and choices, and why:**
1. **No test or golden pinned `1.1.0`.** `src/version.ts` reads `package.json`, and the goldens mask it as `<bridgeVersion>`. So there was nothing to update, and I added the pins that the phase 7 test seams name:
   - a new test, `contract: the CLI prints the release version` (`--version` prints `1.2.0\n`);
   - one added assertion, `serverInfo.version === '1.2.0'`, in `tests/mcp.test.ts`'s pre-phase-7 smoke test. Its existing assertions are unchanged.

   Each of them failed on 1.1.0 before the bump. A future bump edits both literals, as a golden would; reading `package.json` in the test would be tautological.
2. **The CHANGELOG names `docs/guide/12-android-setup.md` as a code path, not a link.** Issue 23 creates that page on another branch, and `tests/docs.test.ts` fails any relative CHANGELOG link to a missing file. Once 23 is merged, the coordinator can make it a relative link. The release notes already link it by its GitHub URL at `v1.2.0`.
3. **ADR-0006 is linked by its GitHub URL at `v1.2.0`**, because `docs/adr/` isn't in the tarball.
4. **"Checked before release" states each check and the result it expects, not a result.** Phase 8 hasn't run. A comment tells phase 9 to rewrite each line as what happened. The placeholders are HTML comments (`<!-- phase 8: check N … -->`), so `grep 'phase 8:'` finds them all. Every check gets one except 8, the real-phones checklist, which "Know before you start" covers.
5. **Left out of Changed:** the iOS pane's "app stopped" check now asks the driver (phase 5). Its output is the same by design. The notes name it only on check 13's line.

**Tests added:** the two version pins above.

**Review** (`/code-review`, fixed point `17fb0c5`):
- **Standards:** 0 hard violations, and 3 judgement calls plus 2 wording notes.
  - Fixed: "lock folder" became "the same folder 1.1 used", per the glossary.
  - Kept, for the reasons above: the duplicated version literal, and the setup page as a path.
  - Kept: the inline `tsx` launch in the new test, which is the file's existing idiom.
  - "server" in the plugin setting line means the MCP server, not the device agent.
- **Spec:** no missing items and no scope creep, and 3 wrong or overstated claims. All fixed in `57163a8`:
  - "Checked before release" asserted results; it now states expected results;
  - "typed key by key" became "typed directly";
  - `sweptLeftovers` became "after a takeover that cleared leftovers".

  Also fixed: check 13 had no placeholder. Not added: `selectable: false` by name, because "each element line may gain fields" covers it.

**Gate:** `npm run check` passed, 513 of 513 tests, then the build, at `57163a8` (log: `$TMPDIR/implement-phase7-24-check.log`). `node dist/cli.js --version` prints `1.2.0`. No golden file changed. No device, adb server or mobilecli was touched.
