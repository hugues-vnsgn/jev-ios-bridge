# Explicit-script evaluation plan

Status: main-agent reviewed implementation plan under the owner's approval of ticket 20. This protocol is set before new captures or Jev calls. The exact corpus and manifest require owner label review before paid evaluation. It serves [ticket 21](issues/21-scripted-feasibility.md); it does not replace the failed autonomous-action gate with a passing result.

## Contract under test

The host submits one script containing app/device identity, setup preconditions, explicit typed values, and ordered actions and assertion checkpoints. The bridge prepares once, resolves selectors and checks screen guards against fresh observations, executes the actions, judges only declared assertions, records evidence, and closes once. No host intervention or Jev next-action selection occurs during a run.

Each step has a unique ID. An action is a tap, full-field text replacement, directed swipe, or bounded wait. A selector uses exact accessibility identifier, role, label, or value; at least one identity field is required. Snapshot references and positional indices are not accepted as durable selectors. An input action requires exactly one visible, enabled, nonzero, action-capable target. Screen guards require distinguishing anchors and may forbid conflicting elements. Guard matches also require uniqueness; absent or ambiguous evidence ends inconclusively before action or judgment. Flat accessibility trees can expose background controls, so corpus and script authors must check foreground guards against screenshots.

Every step obtains a fresh observation; an acknowledged input is followed by another observation before continuing. A stale reference causes fresh guard and selector resolution, never guessing or host escalation. Missing or ambiguous targets, unexpected screens, truncation, unsupported text, unknown action outcomes, timeout, or cancellation stop safely. Reuse the device adapter's acknowledgement and lock rules. A wait is explicit and bounded, not a Jev decision. Global step and time budgets never reset at checkpoints.

At least one assertion checkpoint is required, and the script ends at one. Jev receives current-screen evidence and current claims only: no action choices, completion question, future steps, expected truth labels, or scenario values as separate hints. True/false assertions concern observable evidence, not hidden persistence or source-code facts. Probability at least 0.9 means true; at most 0.1 means false; otherwise uncertain. A completed checkpoint passes only if every claim is true. Any uncertain claim leaves the run inconclusive; otherwise a false claim fails. A run passes only after all scripted steps and checkpoints pass. Cleanup failure always prevents a pass.

## Prototype boundaries and ownership

Keep code in `spikes/scripted/`, tests in `tests/scripted-*.test.ts`, and experiment artifacts below `spikes/scripted/corpus/` and `results/`. The five source files hashed by the previous feasibility harness stay unchanged. Reuse existing device and log ports through a local adapter. Production CLI/MCP behavior stays experimental until this gate passes.

| Owner | Files and responsibility |
| --- | --- |
| Main agent | Tracker, protocol, ADRs, owner review, results interpretation, integration/release decisions |
| API implementation agent | Local contracts/schema, assertion-only projection and Jev adapter, frozen experiment harness/CLI, matching tests |
| Execution implementation agent | Selector/guard resolution, script runner and local report, matching tests; coordinates shared contracts with API agent |
| Environment agent | Synthetic capture setup, 24 fresh paired-label cases and review assets; sole simulator operator during capture |

Implement contracts first, then the adapters and runner independently. Use injected ports for tests. Keep one literal-value validation rule matching existing US-keyboard and leading-hyphen restrictions. All errors written to logs must be safe messages; preserve credential/value redaction and owner-only evidence permissions.

## Fixed assertion experiment

Pin `jev-1.13.0` and SDK 0.6.0. Use one preregistered full-screen textual projection and one positive, evidence-based Noul question template. No configuration search, history, Choice, or goal-completion question. Freeze exact projection/filter rules, request wording, budgets, source digest, model, and labels before the held-out run. State plus longest question is capped at 28,000 bytes and total request at 56,000 bytes; overflow remains a counted failure rather than silently dropping evidence.

Capture **24 fresh screen states across at least eight workflow groups and three apps**. Each screen carries one true and one false claim, for 48 judgments. Claims on one screen and screens within one workflow are correlated: report 24 screen cases and per-workflow results, not 48 independent trials. Include saved/unsaved edits, selected/unselected controls, fields and visible text, settled empty results, and the diagnostic total. Exclude every previous held-out screen and every screen used for prompt development. Preserve capture hashes, screenshots, full device JSON, normalized snapshots, label rationale, setup steps, and exact source/configuration.

Old screens may be used for offline development, never as new held-out evidence. No live development call is needed before this first frozen experiment. If an implementation or input defect is found before freezing, fix it and regenerate artifacts. After querying starts, preserve failures; do not relabel, alter the projection, or rerun the same held-out corpus as fresh evidence.

The gate requires all of:

- At least **20/24 true claims** receive probability at least 0.9.
- At least **20/24 false claims** receive probability at most 0.1.
- **Zero false passes**: no false claim receives probability at least 0.9.
- **Zero wrong decisive failures**: no true claim receives probability at most 0.1.
- Every case remains in its denominator, including request, parse, and observation failures.

Also report paired-screen decisive coverage, uncertain answers, raw probabilities, class/workflow counts, tokens, latency, and failures. Zero observed errors in this small exploratory set does not establish a universal error rate. This gate tests assertion judgment only; it makes no autonomous-navigation claim.

## Execution evidence and release sequence

Before live integration, scripted tests must cover strict parsing, unique selector resolution, absent/ambiguous/disabled/offscreen targets, foreground guard failure, fresh references, changed screens, global budgets, cancellation, terminal acknowledgement/lock retention, false and uncertain claims, evidence ordering/replay, and redaction. Require zero wrong-target actions and no silent skips.

After the fresh assertion gate passes, run at least 12 reviewed dedicated-simulator scripts: six expected passes and six expected assertion failures across Weather, Contacts, Reminders, and the diagnostic app. Require every target and terminal verdict to match the script oracle; environmental failures are recorded, not hidden. Exercise missing/ambiguous targets and cancellation separately with inconclusive outcomes. Revisited corpus states are integration evidence only.

Then prove the installed Claude Code submission/report path and diagnostic task. Give the diagnosing host the failed report and app source, withholding the answer-bearing README/test oracle and live screen supervision. Check whether it identifies the faulty total calculation from the evidence. Complete the three same-machine upstream benchmark comparisons, separating Weather build/setup from prepared-app execution and disclosing host permission differences. Record script authoring time/tokens, edits, and selector maintenance as well as execution costs; make no savings claim without those measurements.

Only after these gates, resolve production schemas/policy/evidence/transport tickets, write the production spec, integrate the scripted contract, complete independent standards/spec review, and package/release v0.1.0. A no-go returns to an owner direction decision with all evidence preserved.
