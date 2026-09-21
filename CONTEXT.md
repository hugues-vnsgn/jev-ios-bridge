# jev-ios-bridge: domain glossary

Shared vocabulary for the bridge between a coding agent, the Jev judgment model, and an iOS simulator. Terms here name concepts, never implementation.

## Terms

- **Host agent**: the coding agent that asks for app verification. Claude Code by default; Codex via the same MCP surface. It never touches the device directly.
- **Bridge**: this project. It perceives the device as text, acts on it, and asks Jev for decisions. Owns the whole loop.
- **Jev**: TypeSafe's System One model. Text-only, stateless, returns typed judgments (Choice, Noul, Score) with probabilities. Never sees pixels, never performs actions.
- **Judgment**: one typed answer from Jev to one question over one state. The only thing Jev produces.
- **Scenario**: a developer's natural-language description of what to exercise on the app, plus the assertions that decide pass or fail. The unit of work the host agent submits.
- **Assertion**: a claim about the app that must hold at some point in a scenario. Checked by asking Jev a Noul question over the current observation.
- **Observation**: the device's screen expressed as text at one instant: the pruned accessibility tree plus device and app metadata. What Jev is shown as state.
- **Screenshot**: a PNG of the screen at one instant. Captured for the report and the human. Never sent to Jev.
- **Candidate**: one actionable element in an observation that the bridge could tap, swipe, or type into. Jev chooses among candidates; it cannot choose an element the bridge omitted.
- **Step**: one turn of the loop: observe, ask Jev, act. A scenario is a bounded sequence of steps.
- **Action**: the concrete device input the bridge performs after a judgment: tap, swipe, type, wait, or stop.
- **Run**: one execution of one scenario on one device, from launch to verdict. Has a lifecycle and can be interrupted.
- **Verdict**: the outcome of a run: passed, failed, or inconclusive, with the failing step and evidence attached.
- **Report**: the token-efficient Markdown summary of a run that the host agent reads to decide whether the code change is good.
- **Device**: an iOS simulator identified by its UDID. Physical devices are out of scope for this effort.
- **Device driver**: the bridge's seam over simulator tooling (`xcrun simctl`, `idb`). Boots, installs, launches, observes, acts.
- **Fallback**: the path taken when Jev cannot decide confidently from text alone, where a vision-capable model in the host agent is handed the screenshot instead.

## Avoid

- "Test" alone, when a scenario or a run is meant. Unit tests are a different thing.
- "Session" for a Jev interaction. Jev has no sessions; each request is independent. Use run for the bridge's lifecycle.
- "Agent" for Jev. Jev decides; the bridge acts.
