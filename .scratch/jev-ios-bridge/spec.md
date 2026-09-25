# jev-ios-bridge v0.1 specification

Status: current production contract, awaiting final measurements and independent review. Accepted decisions are in tickets 09–13 and ADR-0003; remaining evidence gates are tracked in the [release plan](release-plan.md). This spec describes explicit scripts. It does not revive the three failed autonomous-navigation designs.

## Purpose and boundary

A developer or host authors a complete iOS script. The host submits it once, the bridge executes it through pinned MobileBuildMCP, and Jev judges assertions at named checkpoints. The host reads the final evidence report without choosing actions during execution. The bridge alone owns the run verdict, budgets, cancellation, device lock, and cleanup. Report and watch readers display recorded facts.

The single domain context is iOS Scenario Verification. Device execution, TypeSafe requests, and evidence storage are adapters. The glossary is [CONTEXT.md](../../CONTEXT.md); module boundaries are in [architecture](../../docs/architecture.md). Public entrypoints use `src/scripted/`; older autonomous modules remain only for historical experiments and their tests.

## Script contract

Accept strict JSON with `app.bundleId`, optional `device.udid`, optional textual `preconditions`, required `values`, and `steps`. Reject unknown fields and all legacy goal-only/autonomous-checkpoint inputs before device work. The device must be a UUID, not a dynamic alias such as `booted`. Canonicalize its spelling; uppercase and lowercase refer to the same device lock.

A script has 1–100 uniquely named steps and ends at an assertion checkpoint. Step and assertion IDs match `[A-Za-z][A-Za-z0-9_-]{0,63}`. A checkpoint has 1–20 assertions with IDs unique within that checkpoint and nonempty claims at most 1,000 characters. Textual preconditions document operator setup; the bridge does not execute or prove them.

Each step has a screen guard. Its `present` array has 1–12 selectors; its optional `absent` array has at most 12. A selector combines exact `identifier`, `role`, `label`, or `value` matches. At least one nonblank identity field is required; `value` alone is insufficient. Empty value filters are allowed. A present anchor must resolve uniquely among visible matching elements; an absent anchor must match none. Ambiguous or contradictory evidence stops inconclusively.

Step kinds:

- `action`: tap a target, replace a field using a supplied `valueKey`, or swipe within a target in one of four directions.
- `wait`: poll until a separate `until` guard holds, bounded by `timeoutMs` from 1 to 60,000 and the whole-run limit.
- `checkpoint`: judge its current-screen assertions, then continue only if all pass.

At most 32 typed values are allowed, each at most 2,048 printable ASCII characters. Empty replacement is supported. A leading hyphen is rejected because the pinned vendor parser cannot type it safely. The bridge never generates a new text value. Typing depends on the simulator keyboard handling modifiers correctly; a successful command acknowledgement alone does not establish the resulting field contents.

## Selection and device effects

Actions require known visibility and enabled state, a positive frame, and the required action capability. No positional index or first-match fallback is allowed. Generic aliases may collapse only under the tested same-identifier and contained-frame rule. The concrete MobileBuildMCP 2.7.1 integration also enables the source-proven identical-button tap rule: same nonempty label, value, exact frame, action set, and eligibility, without identifiers. That rule is internal, applies only to taps and matching button anchors, and does not authorize ambiguous typing or swipes.

Use fresh observations for script steps and after actions before continuing. References are snapshot-scoped. On a stale reference, capture again, reject a changed screen, recheck the guard, and resolve the target again. Never repeat an action with an unknown execution outcome. Distinguishing post-action guards are the script author's responsibility; broad app-title guards do not prove a UI transition.

Only `mobilebuildmcp@2.7.1` performs product device operations. Use its CLI JSON/full snapshot output, with error reporting disabled. The simulator must already be booted and the app installed. Preparation restarts the app, so script navigation begins from the post-launch screen. Persistent setup data may be a precondition; transient preopened sheets cannot be assumed to survive preparation.

Only one run may own a simulator. Keep the owner-only lock until issued commands have terminal acknowledgements and cleanup is known complete. Cancellation stops new dispatch but does not pretend an issued device command was cancelled. The independent command acknowledgement deadline is 35 seconds; default cleanup budget is 10 seconds. An unknown acknowledgement or expired cleanup may retain the lock and require manual recovery. Do not automatically reclaim it based only on age.

## Jev and verdict policy

Pin `jev-1.13.0` and `@typesafe-ai/sdk` 0.6.0. Send the validated full-screen text projection and current checkpoint claims only. Do not send action choices, completion questions, future steps, oracle labels, screenshots, or the values dictionary as separate hints. Rendered state is capped at 24,000 bytes, state plus longest question at 28,000 bytes, and the full request at 56,000 bytes. Overflow is an inconclusive result, not silent evidence truncation.

A probability at least 0.9 is true; at most 0.1 is false; anything between is uncertain. An uncertain claim makes the checkpoint inconclusive even when another claim is false. Otherwise any false claim fails. Every step and checkpoint must complete successfully for a passed run. Cleanup failure prevents a pass. Malformed or missing probabilities, model mismatch, transport failure, missing/ambiguous targets, wrong guards, timeout, cancellation, and unknown device outcomes stop inconclusively. No fallback asks the host to choose an action.

Public run limits are integer `maxSteps` 1–100 and `wallTimeMs` 1–3,600,000, defaulting to 100 and 300,000. Budgets apply across the whole script, not separately per checkpoint. The report records the reason, step count, tokens, phase durations, and device reference counters.

## Evidence, report, and watch

Persist ordered JSONL events under owner-only run directories, with private files and screenshots. Record preparation, captures, actions, waits, judgments, checkpoints, errors, and the final verdict. Preserve incomplete runs as inconclusive; a damaged middle journal is an error, while an incomplete final line can be recovered. Running progress counts script steps, not repeated wait captures.

Redact the API key and exact supplied typed values from textual evidence. Preserve known generated protocol enums; replace sensitive authored IDs with consistent per-run keyed pseudonyms so checkpoint and probability references still join without exposing the original IDs. This is literal redaction, not a guarantee against transformed values or unrelated sensitive screen text. Screenshots are local and unredacted. TypeSafe receives observed screen text and current claims, which may contain typed values as displayed by the app.

The final text report is bounded to 24,000 UTF-8 bytes. Prioritize terminal failing/inconclusive checkpoint evidence, show claims and probabilities, and include useful observed text, step/screenshot pointers, and truncation notices. Preserve the complete redacted assertion observation in the local journal. Report and watch must not reinterpret the verdict.

Serve the watch page on `127.0.0.1` with a URL token. Use text-safe rendering and a restrictive content policy. Show the step timeline, captured screenshots, action/checkpoint evidence, and available log tails. Return the URL with the run ID. The watch server ends with the bridge process; it is not a video stream or a second device controller.

## Host and distribution

Use MCP TypeScript server 2.1.0 over stdio. Expose only `start_scenario`, `get_report`, and `cancel_run`. Start returns a run ID and watch URL. Running reports contain progress only. `get_report` may wait at most 45,000 ms; cancelling that wait does not cancel the run. `cancel_run` requests run cancellation and waits for termination/cleanup handling. Use text `content`, without a competing `structuredContent` result.

Ship `/test-ios` as a project-installable skill. It authors the full script before submission, calls start once, and reads the report; it does not supervise per-step screens. Claude Code is the tested host; Codex support is best effort. CLI commands and clean install instructions are in [usage](../../docs/usage.md).

Distribute `jev-ios-bridge-0.1.0.tgz` as a GitHub prerelease asset on the tested `main` commit. Do not publish to the npm registry. Preserve historical evaluation branches and failure artifacts. Scan tracked content for the real secret before publication without printing the secret.

## Acceptance evidence and limits

The frozen owner-approved assertion experiment scored 22/24 true and 23/24 false claims confidently correct, with zero confidently wrong answers. Three judgments were uncertain. Twelve reviewed real scripts matched their separate oracles, and three target/cancellation probes stopped safely. These small correlated samples do not establish a general error rate.

The installed Claude Code path passed Contacts c01 after two preserved inconclusive attempts exposed keyboard behavior and an overly narrow Search-icon guard. The host submitted the corrected script unchanged; the bridge made one assertion request, returned the expected pass, and released its lock. The blind diagnosis correctly identified the Diagnostic app's planted total-calculation bug from its failed report and source.

The production suite currently passes 147 tests, type checking, and build. Final watch evidence, three same-machine benchmark comparisons, independent review, and release package checks are pending. Initial script drafting was not metered; record that missing authoring cost and measure subsequent maintenance. No total cost-saving or break-even claim is supported by prepared execution alone.

v0.1 excludes real-iPhone UI automation, autonomous navigation, automatic hooks, CI operation, and guaranteed non-English behavior. Real transient-wait corpus coverage is deferred; deterministic wait/cancellation behavior has scripted tests and a live cancellation probe. Simulator keyboard drift and restored app state require deliberate setup and distinguishing guards. Failure artifacts remain part of the evidence.
