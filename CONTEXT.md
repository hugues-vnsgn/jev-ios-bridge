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
The external capability that operates the device and captures its screen. On Android it is the device agent together with Android's own debugging tools, both driven by the bridge.

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
The stable identity a device name resolves to: the UDID for a simulator, the AVD name for an emulator, the serial for a phone. An emulator's serial is not one, because it changes with start order.
_Avoid_: device ID, mobilecli ID

**Device lease**:
A bridge's exclusive, recorded hold on one device for one run, keyed by its device identity. Once released, nothing the run started can still act on the device.
_Avoid_: lock

**Device agent**:
The UI-automation program the bridge runs on an Android device to read its screen and act on it.
_Avoid_: DeviceServer, server, mobilecli

**Foreign agent**:
Another tool's UI-automation program holding a device. Android allows only one at a time, so a foreign agent makes the device busy.

**Fence**:
Stopping the device agent and confirming it is gone, so that no agent command whose outcome was unknown can still take effect.

## Perception and evidence

**Snapshot**:
The device layer's capture of accessibility elements at one instant.

**Observation**:
The current screen evidence presented to the assertion judge.
_Avoid_: screen dump

**Element reference**:
A handle to one element in one snapshot, valid only for that snapshot rather than a durable identity. The device layer issues it on iOS; the device driver issues it on Android.

**Settled snapshot**:
A snapshot taken once the screen stopped changing after an action.

**Screen still changing**:
A step's mark when the screen never settled within the bridge's limit, so the step went on with the last snapshot.

**Action**:
An authored device interaction with a resolved target and explicit arguments.

**Typed value**:
A literal supplied by the scenario author for a text-entry action.

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
