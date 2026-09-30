# Phase 7: the guide pages

Status: ready-for-agent
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
