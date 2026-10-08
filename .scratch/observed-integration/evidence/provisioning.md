# Supported simulator provisioning in the pinned device layer

Researched 2026-10-08 against planning baseline `c2ed2b9`, installed `mobilebuildmcp@2.7.1`. Read-only source research: no CLI device commands, simulator operations, application changes, or secrets access occurred.

## Answer

**The pinned layer can discover, boot and install onto an existing simulator. It cannot create a fresh simulator.** The implementation plan must distinguish creation from exclusive allocation. A supplied inventory of dedicated devices can support automatic allocation; creating/replenishing that inventory is an explicit external prerequisite under the current architecture. Listing a device does not prove it is fresh or owned by this bridge. The complete installed catalog contains 82 tool manifests; neither simulator workflow nor any lifecycle manifest exposes create, clone, delete or standalone shutdown. [Simulator workflow](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/manifests/workflows/simulator.yaml), [management workflow](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/manifests/workflows/simulator-management.yaml).

This resolves the bounded capability question, not the subsequent allocation-policy decision. There is no supported command to invent for the missing creation step.

## Supported commands and their evidence

These are command templates derived from the installed manifests, handler schemas and CLI JSON parameter path, **not commands executed during this research**. `mobilebuildmcp` means the pinned package's `build/cli.js` invoked by Node, not an arbitrary global version. Pass an explicit UUID every time; do not select by name, `booted`, or mutable session defaults. [CLI registration](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/cli/register-tool-commands.ts).

| Purpose | Exact CLI template | What the source proves |
| --- | --- | --- |
| Inventory | `mobilebuildmcp simulator list --json '{"enabled":true}' --output json` | Lists available existing devices, returning simulatorId, name, state, availability and formatted runtime. No creation provenance or owner. |
| Boot selected device | `mobilebuildmcp simulator boot --json '{"simulatorId":"UUID"}' --output json` | Executes one vendor-owned `simctl boot`; reports simulator-action-result version 2. No boot-readiness polling in this handler. |
| Install prepared artifact | `mobilebuildmcp simulator install --json '{"simulatorId":"UUID","appPath":"/absolute/App.app"}' --output json` | Checks path existence, delegates installation, returns install-result version 2 with appPath and simulatorId. |
| Destructive erase, only if separately authorized by lifecycle policy | `mobilebuildmcp simulator-management erase --json '{"simulatorId":"UUID","shutdownFirst":true}' --output json` | Optionally attempts shutdown, then erases one UUID. Shutdown failures are ignored; erase result is reported. This is not a standalone shutdown or delete operation. |

Primary handler sources: [listSimulators and createSimulatorListResult](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator/list_sims.ts), [createBootSimExecutor](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator/boot_sim.ts), [createInstallAppSimExecutor](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator/install_app_sim.ts), [installAppOnSimulator](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/utils/simulator-steps.ts), [createEraseSimsExecutor](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator-management/erase_sims.ts).

The catalog also exposes build, get-app-path, launch, stop-app, capture and screenshot operations. `stop_app_sim` stops an app, not the simulator. Avoid combined build-and-run during allocation: it mixes provisioning with launching and does not provide creation provenance. [Simulator workflow](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/manifests/workflows/simulator.yaml).

## Prerequisites and failure ambiguity

- The package README requires macOS 14.5+, Xcode 16.x+, and Node 18+ for npm usage. Those minimums are vendor claims, not a promise for every runtime. This effort's prior live evidence covers iPhone 17 / iOS 27.0 / Xcode 27.0 only. [Vendor README](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/README.md), [prior live report](../../observed-ui/live/report.md).
- Existing available simulator UUIDs and their installed runtime must come from an explicit dedicated inventory. No supported runtime-download, device-type enumeration, fresh-create or clone command was found in the complete pinned manifest inventory. Runtime names returned by list are formatted display names, not raw runtime identifiers suitable for a hypothetical create command. [list source](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator/list_sims.ts).
- The artifact must already be a simulator-compatible `.app` for the selected runtime/architecture, with known bundle ID and evidence of its build. The install handler checks existence, not compatibility or artifact integrity; the underlying install reports compatibility failure. A path-only check cannot establish that the app is the intended artifact. Record an artifact digest, build metadata and bundle ID in the future allocation record. This recording requirement is a recommendation derived from the handler, not an existing vendor feature. [Install source](https://github.com/getsentry/MobileBuildMCP/blob/v2.7.1/src/mcp/tools/simulator/install_app_sim.ts).
- Boot success acknowledges the command, not UI readiness. Installation success likewise does not establish that the app is running or its intended screen is visible. Bound read-only readiness checks and an explicit initial observation are still needed. A lost CLI reply can occur after a side effect: do not automatically repeat boot/install/erase or return that candidate to the pool merely because the caller timed out. This uncertainty policy is a proposed bridge rule; the handlers themselves have no durable allocation journal or cross-process ownership protocol.

## Inputs for the allocation and uncertain-device lifecycle decision

Recommended bounded plan, pending that decision:

1. Accept only an externally supplied, explicit inventory with creation provenance and permitted app/runtime metadata. Do not call arbitrary existing devices fresh merely because they are idle.
2. Persist a reservation before the first device mutation; check both existing admission systems and all retained/quarantined claims. Only then boot/install the exact UUID. A bridge reservation coordinates participating bridge processes, not other native actors.
3. Record each preparation attempt and its acknowledged or unknown result. Unknown preparation outcomes retain the candidate and evidence; they are not reusable stock. Fail allocation honestly when the inventory is exhausted.
4. Preserve all four protected historical/live-test UUIDs referenced by the map and live report. Neither erase nor elapsed time restores uncertain ownership. No automatic erase, shutdown or deletion belongs in the initial uncertain-device path.
5. For a settled successful allocation, retention is currently the only non-destructive fully available lifecycle default. Automated retirement/deletion and standalone shutdown are unavailable through this pin. Destructive erase exists but requires a separately defined eligibility policy and does not remove the simulator or prove native contact release.

**Architecture boundary:** [ADR-0002](../../../docs/adr/0002-mobilebuildmcp-as-device-layer.md) explicitly leaves provisioning to the operator today. Calling supported vendor boot/install through a new bridge allocator needs a documented amendment to that operational responsibility, while keeping the existing device-layer rule. Direct `simctl create`, native framework creation, or a new provider requires a distinct justified architecture decision; [ADR-0007](../../../docs/adr/0007-simulator-presentation-and-a-bounded-ios-point-tap-exception.md) permits presentation and a bounded point tap only, not provisioning. This research does not authorize either change.

If end-to-end autonomous creation remains mandatory, chart a separate provider/exception decision rather than claiming the inventory solution fulfills it. The integration and allocation-from-inventory work can be specified independently of that missing capability.

## Reproducible local source evidence

Installed sources were read from `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/node_modules/mobilebuildmcp`. The package version matches the repository lockfile pin. Compiled JS and corresponding source maps expose the inspected implementations; upstream links above identify the tagged source. SHA-256:

| Installed relative path | Digest |
| --- | --- |
| `package.json` | `fad6902321eaa9000664b78339c467c3ffb1cbf0b27e419821e867446915bf1a` |
| `manifests/workflows/simulator-management.yaml` | `d6bcf6465f69da7e9a7c6a24abb73dbe676488613d8dfc265a2695b43fc11c60` |
| `manifests/workflows/simulator.yaml` | `bc3fcb01ccf059074d916e10883b74421816956967f2bf778b24d373f930dd7d` |
| `build/mcp/tools/simulator/boot_sim.js` | `239a2bfad38c169c5026e12f4c63af419687c02f3d86bb2e3cb169593bc227e9` |
| `build/mcp/tools/simulator/list_sims.js` | `7e16ab00cc100b12f7b57796a7294727d12f1c6db99d0ce13375ba08d5dd79d8` |
| `build/mcp/tools/simulator/install_app_sim.js` | `418552c07af805a14d08cd9a85f4ace9e97828239850fcc936c12dad7ba35bb1` |
| `build/mcp/tools/simulator-management/erase_sims.js` | `ec9c73b146e4d6918a19c2ec9c9315b4cc158fa0f5a3fdbea345b70071354cbb` |
| `build/cli/register-tool-commands.js` | `be444c7e8a1e8f226dd449c02f48f06e21456cc86b11702c326e721cabf1d1b5` |

No provisioning behavior was live-validated here. This is sufficient to resolve supported-capability discovery, not to approve a production allocator or recovery policy.
