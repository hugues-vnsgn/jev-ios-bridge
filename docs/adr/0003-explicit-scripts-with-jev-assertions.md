---
status: proposed
date: 2026-09-24
---

# The bridge executes explicit scripts; Jev judges assertions

Three owner-reviewed experiments failed ADR-0001's autonomous-action feasibility gate. The checkpoint version selected 17 of 20 approved actions but accepted only 10 cases under the consistency rules. Two unsaved forms elicited premature stop choices; their completion probabilities prevented accepted errors. [Ticket 19](../../.scratch/jev-ios-bridge/issues/19-checkpoint-feasibility.md) preserves the result.

The owner approved evaluating a different contract in [ticket 20](../../.scratch/jev-ios-bridge/issues/20-post-feasibility-direction.md). A developer or host authors a complete action script before the run. The bridge resolves selectors and screen guards, performs actions through MobileBuildMCP, and asks Jev only about assertions at declared checkpoints. The host submits once and reads a final report. It does not receive screens or choose actions during execution.

This preserves bridge-owned execution but removes Jev's next-action role. Scripts cost more to author and maintain, cannot improvise around unexpected screens, and may need app-specific accessibility identifiers. Missing or ambiguous targets stop inconclusively. The bridge owns the final verdict, time limits, device lock, cleanup, and evidence. Assertion uncertainty also stops inconclusively; there is no hidden fallback to host control.

Evaluation approval is not production acceptance. [Ticket 21](../../.scratch/jev-ios-bridge/issues/21-scripted-feasibility.md) requires deterministic execution tests and a separately frozen, owner-reviewed 24-screen assertion experiment. The [protocol](../../.scratch/jev-ios-bridge/scripted-evaluation-plan.md) fixes its denominators and thresholds before querying. Installed-host runs, a blind diagnosis task, and measured authoring/execution costs follow only if feasibility passes.

ADR-0001 remains proposed with its three no-go results. This ADR will supersede its runtime decision only after the scripted contract is supported by evidence and accepted for production. ADR-0002's MobileBuildMCP boundary remains unchanged. No release or performance claim follows merely from this proposal.

## Assertion evidence

The owner-approved frozen assertion evaluation met its gate on one run: 22/24 true claims and 23/24 false claims confidently correct, with zero confidently wrong answers and no request failures. Three judgments were uncertain. [The results](../../spikes/scripted/results/evaluation/results.md) support proceeding to real scripted integration under the owner's delegation. This is a small exploratory assertion result, not evidence of autonomous navigation or a universal error rate. Real execution, installed-host, diagnosis, and comparison gates remain before production acceptance.
