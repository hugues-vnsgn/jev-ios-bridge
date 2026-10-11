# Narrow legacy credential exception — implementation pending review

Root selected this exception under the owner's original AGENTS instruction confirming a real credential and explicit environment-file use in worktrees, plus autonomous execution authority. It is restricted to the L04 refused legacy successor. No credential has been read or loaded during this source-only implementation. `dispatch.json` keeps the exception disabled pending independent review.

## Why a key-free public successor cannot prove admission

CLI `run` checks TYPESAFE_API_KEY in `src/cli.ts:176`. MCP's actual legacy tool is `start_scenario` (`src/mcp/index.ts:33`), which calls `BridgeService.start`; `src/service.ts:81` eagerly constructs the judge before execution. `src/scripted/jev.ts:86–92` rejects missing keys and constructs TypeSafeClient. Neither public path reaches admission key-free, even with a wait-only script. A missing-key refusal cannot count as DEVICE_BUSY.

Installed @typesafe-ai/sdk0.6.0 `dist/index.mjs:510–532` constructor reads configuration, assigns the fetch function and constructs Models; Models constructor:360–362 only stores transport. Source shows no network call during construction. `systemOne:553` calls `#request:565`, eventually `this.fetch:641`. In bridge execution, driver preparation at `src/scripted/run.ts:303` precedes step processing/judgment at476. Quarantined-device admission at `src/device/index.ts:794–796` refuses before driver attachment or backend calls. The chosen wait-only script contains no checkpoint/model assertion regardless.

## Bounded exception

- Controller and every observed operation remain key-free. The controller never reads `.env`.
- One L04 silent legacy child uses explicit `--import legacy-bootstrap.mjs`. It sequentially loads the ordinary key-free recorder, then the dedicated legacy guard, before the unchanged compiled CLI entrypoint.
- The guard validates the exact declared public argv, L04/silent/legacy binding and separately reviewed exception. It installs outbound denials before credential access: global fetch, HTTP(S) request/get, net connect/createConnection/Socket.connect, TLS connect. The original production HTTP watch listener is permitted exactly once on ephemeral port0 at127.0.0.1; all other listen forms refuse. This is scoped instrumentation of the inspected runtime paths, not an OS network sandbox or general JavaScript security boundary.
- Read only `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env`, through a no-follow held descriptor; require real ancestors, current owner, mode0600, single link, <=64KiB and unchanged lossless identity/metadata. Parse locally and assign only TYPESAFE_API_KEY to this process. Never print/copy/hash/commit it or retain file contents. No fallback credential. Failures use fixed messages.
- All backend commands are denied before command/environment serialization. Common recorder retains the original key-free environment token only. No key-bearing environment hash is written. Guard exit receipt contains booleans/counts only and deletes the environment entry on exit.
- Run the ordinary public CLI wait-only successor against the exact L04 device. Require inconclusive DEVICE_BUSY at prepare, exit2, zero steps/tokens, zero outbound attempts, zero backend attempts, one permitted watch listener, actual process close and retained private guard receipt.
- Any denied request, backend attempt, missing receipt, changed input, authentication problem, unexpected outcome or timeout stops the batch. No retry or SDK judgment is permitted.

This demonstrates public legacy admission with a credential loaded for eager construction. It does **not** test authentication, API connectivity, model behavior or successful legacy execution. Product sources remain unchanged. Review must assess guard coverage, import ordering, secret retention, report mapping and counter/close proofs before enabling.
