# Start mode "attach"

Status: ready-for-agent
Type: task
Spec: [../spec.md](../spec.md)
Blocked by: 02, 07

## What to build

E2: `"start": "attach"` runs from the screen that is already showing instead of relaunching the app. Today Issue 06 refuses it at run time (`runScriptedScenario`). Remove that refusal and pass the start mode to the driver's `prepare` (a field on `PrepareScenarioContext`); both drivers then skip their restart (iOS `simulator launch-app`, Android force-stop + `am start -W`) but still take the device lease, check the app is installed and in the foreground (refuse with a clear reason if it isn't), and start the log streams. Record the start mode on the `started` event. `restart` and an absent `start` behave exactly as today.

## Acceptance

Driver tests for attach on both platforms (no relaunch command issued; foreground check; lease taken); v1 goldens unchanged; `npm run check` passes.

## Comments

- 2026-10-01, coordinator: Issues 02 and 07 are merged. Issues 08 (`service.ts`, `mcp`, `log`) and 09 (`project.ts`, `step.ts` hook, plugin) run in parallel; stay in the drivers' `prepare`, `PrepareScenarioContext` and the attach refusal in `run.ts`.
