# Driven handbacks

A version 2 `do` step can pause for the MCP client to inspect the current screen and answer one action or completion. The final checkpoint still decides the run verdict.

## Sub-features

- `driven-enable` requires project opt-in and the environment switch.
- `driven-local` pauses a local-only step without a Jev decision call for that step.
- `driven-answer` binds an answer to the returned run and pause IDs.
- `driven-timeout` ends an unanswered pause inconclusively.

## How to get to it (user POV)

Set `JEV_EXPERIMENTAL_DRIVEN=1` in the server environment and write `{"drivenMode":true}` to the isolated project's `.jev/config.json`. Submit a version 2 scenario containing a `do` step through `start_scenario`, then answer with `resolve_step`.

## Driving it with a stdio MCP client

Preconditions:

- Complete [MCP lifecycle](mcp.md) setup with the built server, real key, and assigned Android diagnostic emulator.
- Use a fresh `proof_project`. Keep real project config untouched. Live iOS driven runs write the real admission store and require the owner's go-ahead.

- **Enable both gates.** Create the temporary project file below. Launch a new server using the MCP recipe with the additional environment `JEV_EXPERIMENTAL_DRIVEN=1`. Require `resolve_step` in `tools/list` and `handbackTimeoutMs` in `start_scenario`'s advertised limits.

```sh
mkdir -p "$proof_project/.jev"
printf '%s\n' '{"drivenMode":true}' > "$proof_project/.jev/config.json"
```

- **Prepare the scenario.** Parse `examples/diagnostic-app-android/scenario.json`, change `version` to 2, and prepend the step below. Preserve its Android package, three scripted actions, and final checkpoint. A `do` step has no `guard` field.

```json
{"id":"inspectInitial","kind":"do","intent":"Inspect the initial selection","doneWhen":"Selected: None is visible","effect":"none","localOnly":true}
```

- **Pause.** Call `start_scenario` once with `{scenario, limits: {maxSteps: 10, wallTimeMs: 300000, handbackTimeoutMs: 300000}}`. Retain the returned `runId`. Call `get_report` with `{runId, waitMs: 1000}` until its text reports `needs_claude`. Require reason `LOCAL_ONLY_STEP` and step `inspectInitial`. Save the pause's actual ID, expiry, screen text, and screenshot path.
- **Answer.** Inspect the captured screen and require `Selected: None` before calling `resolve_step` with `{runId, pauseId, answer: {kind: "done"}}`. Require the accepted-answer text, then poll the same run until `Status: finished`. Retrieve JSON through CLI `report --json`. Require `driven.doSteps` to contain `inspectInitial` with `completedBy: claude`, and `driven.handbacks` to contain `LOCAL_ONLY_STEP` with `answer: done`. Require `handback` and `handback_answer` events and no `decision` event for this local-only step. The unchanged diagnostic checkpoint still ends `failed` / `ASSERTION_FALSE`, with CLI report exit 1.
- **Time out separately.** Start a fresh run of that scenario with `limits: {maxSteps: 10, wallTimeMs: 300000, handbackTimeoutMs: 1000}` and leave its pause unanswered. Require terminal `inconclusive` / `HANDBACK_TIMEOUT`, CLI report exit 2, an unanswered handback, and `completedBy: null`. Check owned cleanup. The short timeout may expire before a poll displays the pause, so its event log must prove the handback occurred.
- **Keep proof and clean up.** Retain requests/replies, the screen inspected before answering, report/events/screenshots, and cleanup receipts. Close each owned client and remove only the temporary project config through the main skill's Cleanup. Evidence survives.

## Gotchas

- Config alone does not enable driven mode. The switch accepts `1` or `true`, case-insensitive. Missing either gate refuses `do` scripts with `DRIVEN_NOT_ENABLED` before device access.
- `resolve_step` is an MCP tool only. CLI `run` prints pauses and waits but cannot answer them, so an unanswered CLI pause ends `HANDBACK_TIMEOUT`.
- Use the actual returned pause ID and current refs. A stale answer can yield `SCREEN_CHANGED` and a new pause. Inspect that new screen instead of replaying the old answer.
- Pauses hold the device. Their default timeout is five minutes, configurable from 1000 to 1800000 ms. Paused time does not consume the run's wall-time budget.
- Local-only decisions do not prove Jev's action choices. The later checkpoint still sends ordinary diagnostic screen text for judgment. The repo does not provide a live-risky-action or private-screen fixture for every other handback reason.
- `tapAt` and `start: attach` are Android-only. iOS refuses them with `UNSUPPORTED_ACTION`; that refusal does not remove its admission-store approval gate.
