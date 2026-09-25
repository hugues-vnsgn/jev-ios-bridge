# iOS Scenario Verification

The bridge verifies an iOS app by executing an authored scenario and judging its screen assertions. This glossary names the domain concepts shared by authors, execution, and evidence.

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
The external capability that operates the device and captures its screen.

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

**App under test**:
The app exercised by a scenario, identified by its bundle ID.
_Avoid_: target app

**Device**:
The simulator or phone on which a run takes place.

**Run**:
One execution of one scenario on one device, from preparation to its recorded outcome.
_Avoid_: session

**Verdict**:
The run's recorded outcome: passed, failed, or inconclusive.

## Perception and evidence

**Snapshot**:
The device layer's capture of accessibility elements at one instant.

**Observation**:
The current screen evidence presented to the assertion judge.
_Avoid_: screen dump

**Element reference**:
A device-layer handle tied to a captured element, rather than a durable identity.

**Action**:
An authored device interaction with a resolved target and explicit arguments.

**Typed value**:
A literal supplied by the scenario author for a text-entry action.

**Run log**:
The ordered record of a run's observations, actions, judgments, and outcome.

**Report**:
The verdict and supporting evidence presented to the host agent after a run.

**Watch view**:
The person's view of recorded progress and evidence during a run.

**Log pane**:
The person's live view of the app under test's own output (prints, system logs, crashes) during a run, in a window separate from the host agent.
_Avoid_: console, run log
