# Mobile Scenario Verification

The bridge verifies an iOS or Android app by executing an authored scenario and judging its screen assertions. This glossary names the domain concepts shared by authors, execution, and evidence.

## Parties

**Host agent**:
The coding agent that submits a scenario and reads its report.
_Avoid_: client, caller

**Bridge**:
The system that owns scenario execution, assertion judgment, evidence, and the final verdict.
_Avoid_: agent

**Jev**:
The external judgment model that answers the scenario's screen assertions with probabilities.
_Avoid_: planner, agent

**Device layer**:
The external capability that operates the device and captures its screen: the bridge's frozen Appium stack, reached through the private MCP child, with WebDriverAgent on iOS and the device agent on Android. Android's own debugging tools and `simctl` work beside it, for the steps Appium doesn't own. Earlier releases used MobileBuildMCP on iOS and mobilecli's device agent on Android.

**Private MCP child**:
The bridge's own Appium MCP server process, one per command. The bridge starts it with a restricted environment and a private HOME under its per-account folder, and reaches it only through its private MCP client. When that client disconnects, the child deletes its sessions and ends.
_Avoid_: MCP server (the bridge's public server)

**Extension**:
The bridge's small versioned extension to Appium's public core, loaded into the private MCP child. It offers only an allowlisted set of operations, and each one is bound to the session the bridge created and to that session's device. It exposes no arbitrary driver method or script.

**Device driver**:
The bridge's adapter to one device layer.

## Scenario and run

**Scenario**:
The complete authored unit of verification: an app, setup preconditions, typed values, and an ordered script of actions, waits, and checkpoints.
_Avoid_: goal-only request

**Script**:
The ordered steps supplied before a run starts.

**Step**:
One authored action, wait, or assertion checkpoint within a script.

**Selector**:
An authored description of a screen element, independent of a particular capture's reference.

**Guard**:
Visible evidence required, or forbidden, before a step may proceed.

**Checkpoint**:
A declared point in a script where the current screen's assertions are judged.

**Assertion**:
A claim about visible app evidence that must hold for the scenario to pass.

**Platform**:
The mobile operating system a scenario targets: iOS or Android. Each platform has its own device layer.

**App under test**:
The app exercised by a scenario, identified by its bundle ID on iOS or its package name on Android.
_Avoid_: target app

**Device**:
The simulator, emulator, or phone on which a run takes place.

**Profile**:
A named, project-level choice of platform, device category and device, optionally with an app guard and budget ceilings, that a run may select instead of naming its device directly. A run keeps the profile it was bound to at its start.
_Avoid_: configuration, target

**Launch options**:
How the app under test is started: launch arguments on iOS; an activity and intent extras on Android.

**Run**:
One execution of one scenario on one device, from preparation to its recorded outcome.
_Avoid_: session

**Verdict**:
The run's recorded outcome: passed, failed, or inconclusive.

## Devices

**Device name**:
What a scenario or setting uses to name a device: a simulator UDID, an adb serial, or an emulator's AVD name.

**Device identity**:
The stable identity a device name resolves to, within its device category: the UDID for a simulator, the AVD's content directory for an emulator, the hardware serial for a phone. Transport details (an emulator's serial, a phone's adb serial or network address, a process) are never part of it.
_Avoid_: device ID, mobilecli ID, AVD name (as identity)

**Device category**:
The kind of device an identity belongs to: iOS simulator, Android emulator, Android phone, or iOS phone. The iOS phone is reserved, and is refused until enabled. Two devices in different categories never share an identity.

**Device lease**:
A bridge's exclusive, recorded hold on one device for one run, keyed by its device identity. Once released, nothing the run started can still act on the device.
_Avoid_: lock

**Legacy lease**:
A device lease recorded only as a lock file, by a bridge that did not use the admission authority, and named only by a device name. Its run's native work is never assumed settled: a leftover legacy lease becomes a quarantine.

**Device agent**:
The UI-automation program the bridge runs on an Android device to read its screen and act on it: the frozen stack's UiAutomator2 server. Earlier releases used mobilecli's device agent.
_Avoid_: DeviceServer, server, mobilecli

**Foreign automation**:
Appium automation on the device being admitted that this bridge did not start: UiAutomator2 instrumentation or server, a WDA runner, or an automation forward (a forward to a UiAutomator2 device port), whose identity is not owned in the admission store. The bridge recognizes it by owned inventory, not by process name, refuses with `DEVICE_BUSY`, and never stops it. Automation on another device, a forward to any other port, and the bridge's recorded components are never foreign. The user guide calls it a foreign agent.

**Fence**:
Stopping a native component and confirming it can no longer act, so that no command sent through it whose outcome was unknown can still take effect. This applies to device agents, adb commands, host streams, port forwards, MobileBuildMCP invocations and Appium sessions. Each component needs its own stop evidence.

**Fence receipt**:
The admission authority's record that one owner generation's fence is proven: dispatch closed, every command it issued settled or fenced, and every native component it recorded unable to act. It releases that owner's device lease or covers its quarantine. A receipt for another generation, or one naming no generation, covers nothing.

**Quarantine**:
An append-only record that work nobody has proven stopped may still act on a device, or that the device is excluded. A fence receipt covers it; nothing deletes it. A device is quarantined while any quarantine on it is uncovered, whatever its runs' outcomes were.

## Perception and evidence

**Snapshot**:
The device layer's capture of accessibility elements at one instant.

**Observation**:
The current screen evidence presented to the assertion judge.
_Avoid_: screen dump

**Element reference**:
A handle to one element in one snapshot, valid only for that snapshot rather than a durable identity. The device driver issues it, as `eN`, from its own normalized snapshot, bound to one Appium session; the device layer's own element IDs are never exposed.

**Settled snapshot**:
A snapshot taken once the screen stopped changing after an action.

**Screen still changing**:
A step's mark when the screen never settled within the bridge's limit, so the step went on with the last snapshot.

**Action**:
An authored device interaction with a resolved target and explicit arguments.

**Typed value**:
Text supplied by the scenario author for a text-entry action: a literal, or `{ "fromEnv": NAME }`, read from the bridge's environment once when the run starts.

**Shown value**:
What a text field displays after the bridge typed a typed value into it. It may legitimately differ from the typed value.

**Run log**:
The ordered record of a run's observations, actions, judgments, and outcome.

**Report**:
The verdict and supporting evidence presented to the host agent after a run.

**Watch view**:
The person's view of recorded progress and evidence during a run.

**Log pane**:
The person's live view of the app under test's own output (prints, system logs, crashes) during a run, in a window separate from the host agent.
_Avoid_: console, run log

## Observed actions and admission

**Observed action**:
One authored tap attempt with visible before/after guards on a dedicated allocation.

**Observed outcome**:
The recorded deterministic outcome of an observed action: outcome observed, already satisfied, refused, or inconclusive. It is not a scenario verdict, causal proof or native receipt.

**Observed evidence**:
The local captures and authoritative outcome references that support an observed action's result.

**Device admission**:
The bridge's durable authorization to operate one canonical device. It is distinct from Device lease and does not certify native release.

**Device allocation**:
One dedicated simulator assignment for one declared action identity.

**Prepared allocation**:
An allocation whose preparation completed and whose ownership is parked for one action.

**Retained allocation**:
An allocation that cannot return to inventory under the current lifecycle policy.

**Unknown creation**:
Creation that may have produced a device without its identity being durably known.
