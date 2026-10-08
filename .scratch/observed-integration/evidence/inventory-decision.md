# Dedicated simulator inventory replenishment decision

Resolved 2026-10-08 for [Choose how dedicated simulator inventory is replenished](../issues/08-inventory-replenishment.md). Planning only: no devices were listed, created, booted, modified, or retired. No application, product code, claims, or secrets were accessed or changed. This decision is implementation scope, not a claim that an allocator already exists or has passed live acceptance.

## Decision

Implement automatic fresh creation through a **narrow host creation adapter** running `xcrun simctl create`, followed by pinned MobileBuildMCP boot, install, launch and observation on the returned explicit device identity. Require an explicit approved device-type identifier and runtime identifier; do not accept the command's implicit newest-runtime default. The adapter creates a new dedicated simulator for a new allocation and records its provenance. It does not clone, reset, erase, delete, shut down, download runtimes, or perform UI actions. Native callback/receipt availability is not a prerequisite for this observed-action preparation route.

This deliberately amends ADR-0002. ADR-0007's existing presentation and point-tap exceptions do not authorize creation, so they cannot be stretched to cover it. A creation-only exception adds no new UI transport: all app interaction and visible evidence continue through the pinned device layer. The app under test remains unmodified and requires a simulator-compatible artifact, its known bundle ID and build provenance; creation does not make an arbitrary iPhone binary installable.

Automatic fresh creation is bounded by configured storage/device/time budgets and installed host prerequisites. It is not unbounded fleet management. Exhaustion is a truthful preparation failure before any app action, with the retained allocations and reason available to the host agent. No human replenishment step is required for an ordinary new allocation while creation is supported and budget remains. Later cleanup/reclamation is a separate decision and cannot silently be used to fund new creation.

## Evidence: supported commands and their limits

The primary installed Apple command help was inspected read-only on this host:

```text
$ xcrun --find simctl
/Applications/Xcode.app/Contents/Developer/usr/bin/simctl

$ xcodebuild -version
Xcode 27.0
Build version 27A266a

$ xcrun simctl help create
Create a new device.
Usage: simctl create <name> <device type id> [<runtime id>]
```

The remainder of `help create` states that device type and runtime must be valid and available, and that omitting the runtime chooses the newest compatible runtime. The supported planned invocation is an argument array, never shell interpolation:

```text
xcrun simctl create <unique-allocation-name> <explicit-device-type-id> <explicit-runtime-id>
```

The prior [live allocation record](../../observed-ui/live/allocation.md) records three fresh devices created using that command with `com.apple.CoreSimulator.SimDeviceType.iPhone-17` and `com.apple.CoreSimulator.SimRuntime.iOS-27-0`. Its [live report](../../observed-ui/live/report.md) records unmodified-app observed outcomes on the resulting fixture devices. These establish a previously used creation route on this host/runtime; they do not establish automatic allocation crash recovery or broader runtime support. No new creation was attempted here.

`xcrun simctl help list` was also read, without listing anything. It documents JSON output and the `devices`, `devicetypes`, `runtimes`, and `pairs` filters. This confirms a possible primary metadata interface, but **this decision does not add direct `simctl list` to the bridge's command allowlist**. The initial adapter takes fixed configured identifiers and surfaces an unavailable runtime/type honestly; installation or runtime download remains a host prerequisite. Any future direct metadata-discovery exception needs explicit scope and tests.

The installed simulator and simulator-management workflow manifests were reread under `node_modules/mobilebuildmcp/manifests/workflows/`. They expose `list_sims`, `boot_sim`, `install_app_sim`, `launch_app_sim`, observation tools and destructive `erase_sims`, but no creation tool. The complete catalog and handler evidence are in [supported provisioning research](provisioning.md), including exact pinned boot/install command templates and source digests. No unsupported MobileBuildMCP command is proposed and its pin remains 2.7.1.

The local `create` help does **not** document output-envelope guarantees, timeout atomicity, lack of side effects on nonzero exit, or an idempotency token. The prior allocation note records UUIDs but not raw create replies. Consequently the new adapter must validate one successful UUID reply and capture raw process outcome during acceptance; it must not claim those guarantees today. A unique name is an evidence label, not an idempotency key or ownership proof.

## Alternatives and the design move

| Route | Supported now | Autonomous replenishment | Decision |
| --- | --- | --- | --- |
| Explicit supplied fresh inventory; vendor boot/install | Yes, with external creation provenance | Stops when stock is consumed; replenishment external | Keep as explicit fixture/fallback source, not the default or a claim of full provisioning |
| Narrow `simctl create` adapter; vendor boot/install | Installed primary help supports creation; prior fixture allocations used it | Creates new dedicated stock within host and budget limits | Chosen; requires the ADR amendment below and host/live gates |
| Add creation to a fork/new version of MobileBuildMCP | No such tool in the pin; no inspected implementation | Could eventually provide creation | Reject for this handoff: adds dependency/upgrade work without supported current capability |
| Native framework or callback path | No inspected supported creation interface here | Unsupported | Do not make this a prerequisite for observed testing |

The when-stuck inversion was: “fresh simulator creation must be supplied by the UI device layer.” Negating it exposes two separate responsibilities: host resource creation and app interaction. Putting host creation behind one small allocation module preserves the existing UI device layer and avoids spreading shell commands among MCP, CLI and experiment runners. Its interface should return a prepared dedicated allocation or a preparation failure with retained evidence; command sequencing, resource reservation and creation provenance stay in its implementation. A finite supplied-inventory adapter is a real second source at the same internal seam, rather than a hypothetical provider interface.

## Required lifecycle behavior

These are requirements for ticket 05 and the implementation handoff, not claims about current code:

1. Persist a unique **device allocation ID**, configured type/runtime, intended unique name, ownership scope, and budget reservation before starting creation. Use a cross-process allocation admission mechanism so concurrent requests cannot overspend the budget. Unknown create operations and retained devices continue consuming capacity; crashes/PID age do not release it. Existing protected devices and claims must be accounted for as exclusions, not available stock. Distinguish bridge-owned capacity accounting from a guarantee about total host disk capacity.
2. Persist create-started before spawning. Invoke only the approved executable/argument shape under a deadline and cancellation policy. Once creation has started, a lost reply, invalid/missing UUID, process ambiguity or crash leaves a retained pending creation operation, potentially with an **unknown UDID orphan**. Do not blindly retry creation, free its reservation, or adopt a name-matched device. Read-only diagnostics may collect evidence; recovery/adoption needs a separate reconciled ownership decision. Neither unique naming nor a nonzero exit establishes that no device was created.
3. A valid successful UUID response is only a creation receipt. Persist it against the allocation before any vendor mutation, check all admission/retention systems and acquire the device lease before boot/install. Keep the reservation retained if persistence/admission fails; never use a new device as a way around a refused existing business action. Boot/install reply loss likewise retains preparation uncertainty rather than returning stock to the pool or repeating mutations automatically.
4. Separate the allocation ID from the **business action ID**. Admission of an action already attempted or uncertain must be refused across all devices and all allocation sources. A new simulator can support a distinct authorized scenario; it cannot authorize replaying the same uncertain business action. Root must consolidate this with the admission contract; the existing device-only quarantine evidence does not prove cross-device refusal yet.
5. Verify preparation using bounded read-only observation through MobileBuildMCP before dispatching the app action. Vendor boot/install acknowledgement is not UI readiness or a native receipt. An unavailable native route must not prevent ordinary observed-action testing when this supported preparation and UI route is available.
6. If prerequisites are absent, creation is unsupported, the budget is exhausted, or a preparation operation becomes uncertain, return a concrete preparation result without app action. Do not silently switch to arbitrary existing devices or from an uncertain create to supplied stock. Explicit supplied inventory remains a source selected before the attempt, with provenance and exclusive reservation; it is not automatic recovery after uncertainty.
7. Retain every allocated device by default in this first slice, including successful allocations. No automatic cleanup or claim clearing. Preserve `73997430-DB8A-48C8-8146-12320CE6AEFE`, `2FE383F2-2D0F-4286-8797-D3ACEFCD6220`, `6A8C5F93-F59A-456B-B157-10642209B734`, and historical `0E42FDE2-5E09-42D3-9876-9EF0037FCBE7` with all their claims. None was touched here.

## Draft architecture decision for root to consolidate

Do not edit ADRs from this ticket. Suggested new ADR title: **A bounded fresh-simulator creation exception**. Root assigns its number and adds references/amendment dates to ADR-0002 and ADR-0007.

> The bridge prepares new dedicated iOS simulators autonomously for observed-action testing. Pinned MobileBuildMCP 2.7.1 can boot and install onto an existing simulator but cannot create one, so a host allocation module may invoke only `xcrun simctl create <unique-name> <explicit-device-type-id> <explicit-runtime-id>` as a creation exception to ADR-0002. It durably reserves resources before creation, records returned device identity and provenance before preparation, and retains uncertain creation operations, including those whose UDID is unknown. Boot, installation, launch, UI input and observation continue through pinned MobileBuildMCP; this exception introduces no new UI transport and requires no native callback route or app modification. The bridge does not automatically clone, erase, delete, shut down, reclaim or retry uncertain creation. Creating a device never authorizes replaying an uncertain business action.

ADR-0002's “Simulator provisioning remains an operator task” becomes: **Legacy run preparation retains its existing behavior; the observed-action allocation route owns bounded creation and boot/install preparation through this allocation module. Operators still supply installed Xcode/runtime prerequisites and simulator-compatible app artifacts.** Its “no direct simctl” and “contains no simulator or UI automation code” statements gain the narrow creation exception in addition to ADR-0007's exceptions.

ADR-0007 receives a scope cross-reference: **This record governs presentation and the bounded point-tap path. The fresh-simulator creation exception is governed by the separate creation ADR; it does not extend the permitted UI automation here.** The statement describing `tapAt` as the only direct device automation must be qualified as the only direct **UI input** exception, with a reference to creation. No `tapAt` gate is weakened by this amendment.

Retire the creation exception only after a deliberately adopted pinned provider exposes equivalent creation and passes provenance, uncertainty and resource-budget checks. No provider upgrade is implied by this decision. The v1 script, verdict, report and CLI/MCP meanings stay frozen; new allocation contracts require their own accepted public specification.

## Acceptance still required

Host fault tests must prove reservation before spawn, one creation attempt per allocation, concurrent budget enforcement, unknown-UDID retention, invalid/lost reply handling, persistence failure, exclusion of all four protected identities, and cross-device refusal of an already uncertain business action. Fixture tests must exercise the same allocation interface as production callers.

The sole designated live operator must then run the new public interface on a newly created device, record exact create argv/exit/stdout/stderr, validate its UUID receipt and ownership, install an unchanged simulator artifact, and capture the visible initial screen and outcome through the pinned provider. Existing allocation notes are not that acceptance. Missing runtime, artifact incompatibility, host storage checks, boot readiness and resource budgets need explicit results. Runtime download, broad compatibility, garbage collection and native release certification remain outside this decision.
