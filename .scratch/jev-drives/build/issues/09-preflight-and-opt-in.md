# Preflight, opt-in, local-only screens

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md) (read the "Fixed rules" and "Gates" sections in full)
Blocked by: 07

## What to build

`src/driven/project.ts` reads `.jev/config.json` and `.jev/preflight.json` from `JEV_PROJECT_DIR` (else cwd), strictly validated.

- **Opt-in (E13):** `BridgeService.start` refuses a script with any `do` step with `DRIVEN_NOT_ENABLED` (before the device is touched) unless `drivenMode: true` and `JEV_EXPERIMENTAL_DRIVEN=1`. Add the plugin user setting `experimentalDriven` (boolean, default off) that sets the variable for the MCP server (`plugin/`, `scripts/build-plugin.mjs` as needed).
- **Preflight (E12):** run the command once, without a shell, with a timeout, before the first `test_write` `do` step; log a `preflight` event (ok / missing / failed, exit code, duration; never stdout/stderr). Not ok → every `test_write` step's decisions hand back with reason `NO_PREFLIGHT`.
- **Local-only screens (E14):** before each Jev call, if any element matches a `localOnlyScreens` rule, hand back with `LOCAL_ONLY_SCREEN` and don't call Jev.

## Acceptance

- Tests for each file shape and error, each gate, preflight timeout and failure, rule matching; the preflight's output never reaches the run log.
- `npm run check` passes.

## Comments

- 2026-10-01, coordinator, from Issue 07 (merged `d12c09d`): the loop takes `testWritesAllowed` (default false: Jev's accepted picks on `test_write` steps go to Claude as `NO_PREFLIGHT`) — supply the preflight result there. `localOnlyScreens` must be checked in `src/driven/step.ts` right before the Jev call (hand back `LOCAL_ONLY_SCREEN`; add it beside the other hand-back reasons). **Issue 08 runs in parallel and also edits `src/service.ts`**: keep your service change to one call in `start()` (opt-in check + project config load) and put the logic in `src/driven/project.ts`.
