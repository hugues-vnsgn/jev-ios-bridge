# jev-ios-bridge

The bridge lets a coding agent verify an iOS app by running a scenario on a device, with Jev choosing each step from a text view of the screen. This glossary names concepts, not implementation.

## Language

### Parties

**Host agent**:
The coding agent that asks the bridge to verify an app, then reads the report. Claude Code, or Codex.
_Avoid_: client, caller

**Bridge**:
This project. It runs the loop: it perceives the device as text, asks Jev for judgments, performs actions, and reports the verdict.
_Avoid_: agent, runner

**Jev**:
TypeSafe's judgment model. It answers typed questions about a state it is given, with probabilities, and holds nothing between requests.
_Avoid_: agent, LLM

**Device layer**:
The external tool that boots devices, installs and launches apps, captures snapshots and screenshots, and performs actions. The bridge contains no device automation of its own.

**Device driver**:
The bridge's adapter over a device layer. The only part of the bridge that knows which device layer is in use.

### A run

**Scenario**:
What to exercise on the app, in plain language, with the assertions that decide pass or fail and the values to type. The unit of work a host agent submits.
_Avoid_: test, test case

**Checkpoint**:
One ordered goal and its assertions within a scenario. The run proceeds to the next checkpoint only after the current one is established.

**Assertion**:
A claim about the app that must hold for a scenario to pass, judged by Jev against an observation.

**App under test**:
The iOS app a run exercises, identified by its bundle id.
_Avoid_: target app

**Device**:
The simulator or iPhone a run executes on, identified by its UDID.

**Run**:
One execution of one scenario on one device, from launch to verdict.
_Avoid_: session, test

**Step**:
One turn of a run: observe, ask Jev, act.

**Verdict**:
The outcome of a run: passed, failed, or inconclusive.

**Report**:
The summary of a run that the host agent reads when the run ends, carrying the verdict and the evidence behind it.

### Perception

**Snapshot**:
The device layer's capture of the screen's accessibility elements at one instant. The raw material of an observation.

**Observation**:
The screen as Jev is shown it at one step: the candidates, plus the context needed to judge them, as text.
_Avoid_: screen dump, page source

**Candidate**:
One actionable element in an observation. Jev can only choose among the candidates the bridge includes.

**Element reference**:
The device layer's handle for an element within one snapshot, used to address an action. A new snapshot issues new references, so a reference never identifies an element across steps.
_Avoid_: element id

**Screenshot**:
An image of the screen at one instant, kept for people and for the report. Never sent to Jev.

### Decisions

**Judgment**:
One typed answer from Jev to one question about one observation.
_Avoid_: prediction, completion

**Action**:
What the bridge does after a judgment: a device input such as a tap, swipe, or typed value; a wait; or ending the run.

**Escalation**:
Handing a step Jev could not decide confidently to the host agent, which can look at the screenshot.
_Avoid_: fallback

### Watching

**Run log**:
The ordered record of a run, written as it happens: steps, judgments, actions, build output, and the verdict. The report and every watch view are built from it.
_Avoid_: trace, transcript

**Watch view**:
A view of a run log that lets a person follow a run while it is in progress.
_Avoid_: dashboard, panel
