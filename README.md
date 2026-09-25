# jev-ios-bridge

Verify an iOS app with one authored script and one recorded report. The bridge executes guarded actions through MobileBuildMCP; TypeSafe Jev judges assertions about the resulting screens. Claude Code submits the script and waits, without reading screens or choosing actions during the run.

**v0.1.0 is in release verification.** The assertion-only experiment passed its fixed gate, and twelve real scripts matched six passing and six intentionally failing outcomes. Missing-target, ambiguous-target, and cancellation probes stopped safely. The installed-host path passed. Comparison and final package checks are still in progress.

## What it does

- Runs explicit taps, full-field text replacements, swipes, waits, and assertion checkpoints on a dedicated simulator.
- Stops inconclusively on uncertain judgments, missing or ambiguous targets, unexpected screens, or execution limits.
- Keeps private JSONL evidence and screenshots, returns a report, and serves a token-protected local watch page.
- Preserves the recorded verdict after a run; an interrupted journal never becomes a pass.

The script author supplies the route, selectors, guards, and typed values. The app must already be installed and its simulator booted. Preparation restarts the app, so scripts navigate from its observed launch state. The bridge does not build, install, seed, or reset apps.

## Development setup

Use Node 24 or later on a Mac with Xcode and an iOS simulator:

```sh
npm ci
npm run check
node dist/cli.js --help
```

[Usage](docs/usage.md) covers credentials, scripted JSON, MCP registration, the `/test-ios` skill, evidence, and limits. The planned distribution is an installable package attached to the [GitHub v0.1.0 prerelease](https://github.com/hugues-vnsgn/jev-ios-bridge/releases); npm registry publication is not part of this release.

## Evidence and scope

Three attempts at autonomous Jev action selection failed their preregistered gates. Those results remain intact: [first](spikes/feasibility/results/heldout/heldout.md), [revised](spikes/feasibility/results-v2/heldout/heldout.md), and [checkpoint](spikes/feasibility/results-v3/heldout/heldout.md). The owner then approved explicit scripts with Jev assertion checks.

The [scripted assertion experiment](spikes/scripted/results/evaluation/results.md) used 24 fresh screens with one true and one false claim each. At fixed 0.9/0.1 bounds, 22/24 true claims and 23/24 false claims were confidently correct, with zero confidently wrong judgments. Three answers were uncertain. This is a small exploratory result, not a universal error guarantee.

[Integration evidence](.scratch/jev-ios-bridge/scripted-integration-notes.md) records the real scripts, fault probes, and setup corrections. The blind diagnostic check used a failed report and app source to identify the planted checkout-total defect. Speed and all-in cost claims await the same-machine comparisons.

Current scope: English screen evidence, printable US-keyboard input, simulator UI automation, Claude Code first, Codex best effort. Real iPhone UI automation, automatic hooks, and host escalation are outside v0.1.0. Legacy autonomous scenario forms are rejected by the supported CLI and MCP.

## Design and project navigation

Start with [CONTEXT.md](CONTEXT.md) for vocabulary, [domain boundaries](docs/domain-boundaries.md) for ownership, and [architecture](docs/architecture.md) for the execution and evidence flow. [ADR-0003](docs/adr/0003-explicit-scripts-with-jev-assertions.md) explains the scripted direction; [ADR-0002](docs/adr/0002-mobilebuildmcp-as-device-layer.md) explains the device boundary.

The [map](.scratch/jev-ios-bridge/map.md) and [release plan](.scratch/jev-ios-bridge/release-plan.md) track remaining work. Research, frozen experiments, and historical source archives remain available for audit. The deliberately faulty [diagnostic app](examples/diagnostic-app/README.md) is a verification fixture, not a production example to copy unchanged.
