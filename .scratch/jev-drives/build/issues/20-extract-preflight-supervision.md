# Refactor: move preflight process supervision out of `driven/project.ts`

Status: ready-for-agent
Type: task
Category: enhancement
Spec: [../spec.md](../spec.md)
Review: the reviewer's optional suggestion on PR #36 at `6fb36c8` (2026-10-02); deferred from [Issue 19](19-fix-pr-36-review.md)
Blocked by: none (start after PR #36 merges, on a branch from main)

## What to build

`src/driven/project.ts` (317 lines) does two jobs:

- **Project configuration:** `projectDirFrom`, `experimentalDrivenOn`, reading and parsing `.jev/config.json` and `.jev/preflight.json`, `localOnlyScreen`, and the wiring in `openDrivenProject`.
- **Running the preflight command:** process groups, `emptied`, `stopGroup`, `execute`, `runPreflightCommand`, `appendPreflightEvent`, `runPreflight` and `preflightOnce`.

Move the second job to its own module, for example `src/driven/preflight.ts`, behind the functions `openDrivenProject` already calls. `project.ts` keeps configuration loading and wiring. This is a move with no behaviour change: no new options, no changed event fields, no changed wording.

## Acceptance

- `npm run check` passes with every existing test unchanged, apart from import paths.
- The `preflight` event, its fields and its timing are byte-for-byte the same, and the driven goldens don't change.
- A test that needs to reach the preflight runner imports it from the new module, not through `project.ts`.
