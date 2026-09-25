# Product direction after three feasibility no-go results

Type: grilling
Status: resolved
Blocked by: 19

## Question

Should v0.1 switch to an explicit action script executed by the bridge, with Jev checking screen assertions, or remain an autonomous-navigation research project with release deferred?

The owner delegated implementation through release, while retaining owner discussions and ticket decisions with the main agent. The agreed feasibility gate has now failed three times. Routine implementation authority does not make those measurements pass or establish a different product contract.

| Experiment | Correct / 20 | Accepted / 20 | Wrong accepted | False-pass assertions |
| --- | ---: | ---: | ---: | ---: |
| Broad goals | 15 | 7 | 0 | 0 |
| Revised action projection | 16 | 14 | 2 | 0 |
| Observable checkpoints | 17 | 10 | 0 | 0 |
| Required bar | 18 | 16 | 0 | 0 |

## Recommendation for discussion

Test a smaller product contract: the scenario author supplies ordered actions and screen assertions up front. The bridge resolves each target against a fresh snapshot, executes the script, asks Jev only about assertions at declared checkpoints, and returns the recorded report. The host still submits once and receives no step-by-step screens. It does not drive the device during the run.

For example, the author specifies: tap the Settings control identified by its accessibility identifier; tap the wind-unit control; assert that m/s is selected. The bridge rejects missing or ambiguous targets instead of asking Jev to guess. Typed values remain explicit. Any stale target requires fresh resolution under the same selector; a changed or ambiguous target ends the run inconclusively. Budgets, cancellation, the device lock, and evidence recording remain bridge responsibilities.

This removes autonomous next-action selection from the release contract. It requires authors to know the route and maintain selectors. It differs from the previously rejected architecture where Claude reads and drives every screen, but still changes ADR-0001 materially. Assertion reliability remains unproven: the latest run matched only 19 of 25 assertion labels at the frozen bounds, despite zero false passes.

Before implementation is treated as releasable, review a new protocol for deterministic action execution and a fresh held-out assertion evaluation. Include true and false claims, saved versus unsaved forms, ambiguous or missing targets, cancellation, stale references, and the planted diagnostic bug. Preserve all earlier no-go results and avoid reusing their screens as fresh evidence. Complete the same installed-host and baseline measurements before claiming a speed or cost benefit. Passing this new protocol would support only the explicit-script product, not the failed autonomous design.

## Alternative

Keep Jev choosing every action and defer v0.1 publication. Further research needs a concrete new hypothesis and a fresh preregistered evaluation; another wording iteration or a lower threshold alone is not evidence that the existing release bar has been met.

## Decision

The owner selected **Evaluate scripted bridge execution** in the conversation. This authorizes a prototype and a new evaluation protocol; it does not approve the architecture for publication or turn any prior no-go into a pass. The main agent owns the protocol, tracker, docs, and owner label review. Coding, builds, and tests remain delegated to `gpt-6-sol` high agents.

## Answer

Proceed with [scripted feasibility](21-scripted-feasibility.md). Keep one host submission and bridge-owned execution, replace autonomous action selection with explicit actions and deterministic guards/selectors, and evaluate Jev assertion checks separately on fresh evidence. Publication still depends on passing that contract's preregistered tests and the installed-host and comparison measurements.
