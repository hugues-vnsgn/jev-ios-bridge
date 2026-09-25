# Slice measurements: cost, speed, and diagnosis against the baseline

Type: task
Status: resolved
Blocked by: 16

## Question

Nothing to decide. The spec needs these numbers before it can say the bridge is worth building. Using the slice from "Vertical slice: one scenario end to end from Claude Code", measure:

- **Speed and cost, against Sentry's baseline.** Run the Weather, Reminders, and Contacts suites from the benchmark through the bridge. Record per scenario:
  - wall-clock time;
  - host tool calls;
  - host tokens;
  - Jev tokens and cost.

  The published baseline, Claude driving directly, took 93 to 103 s and 14 to 19 tool calls per scenario, but publishes no token counts. Rerun the baseline harness on this machine, capturing tokens, so the comparison covers cost as well as speed.
- **Per-step behaviour:**
  - latency per step, split into observe, decide, and act;
  - how often confidence falls below the threshold;
  - how often an element reference expires mid-step.
- **Diagnosis.** Build a two-screen SwiftUI app under `examples/`, plant a bug in it, and check whether the report alone lets Claude find the cause.

Resolve with the measurements table and a sample report, linked as assets.


## Progress, 2026-09-25

The blind diagnosis passed. Claude received only the actual failed Diagnostic report and two app source files, with the answer-bearing README/tests, screenshots, tools, and oracle withheld. It identified `CheckoutModel.totalCents` returning the last selected price and proposed summing the selected prices. The [evidence artifact](../../../spikes/benchmarks/blind-diagnosis.json) records input hashes, invocation, response, usage, and 5.787 seconds elapsed. The planted bug remains unchanged.

The Weather, Contacts, and Reminders scripted benchmark drafts are undergoing live preflight before the paired same-machine runs. Initial drafting time and model tokens were not instrumented and cannot be reconstructed honestly. Subsequent preflight/maintenance sessions will record elapsed time, edits, and selector changes. Any execution-cost comparison must disclose the missing initial authoring cost and cannot support a total-savings or break-even claim.


### Reminders baseline classification correction

The first Reminders baseline was initially classified successful from the intended typed list name and correct final completion rows. Deeper review of the actual capture showed the List Name field as `Mộc Benchmark List` after the input call supplied `MCP Benchmark List`. Later compact captures omitted the title, with no recorded correction. The intended input is not proof of saved UI state. This attempt is excluded from successful comparisons; raw results and cost remain preserved, and the verification artifact records the correction. Weather and Contacts have independently observed task outcomes. A corrected Reminders baseline is still required.


The second Reminders attempt showed the correct name before saving but no later capture exposed the saved title. It remains unverified; a successful acknowledgement cannot establish persistence. For attempt three, the main agent approved a local, recorded post-host audit seam in the upstream harness: capture the final full accessibility state and screenshot after host timing ends, before deleting its temporary simulator. The task and host prompt stay unchanged, and audit time is separate. This captures missing outcome evidence without tuning the task or one variant's keyboard settings.


Attempt three's audit could not launch the pinned CLI from the source checkout, so the saved-title evidence remained missing even though the host completed. Under the owner's release delegation, the main agent approved one additional baseline attempt after a read-only audit-command preflight, with an absolute verified CLI path. This explicitly exceeds the upstream three-attempt recommendation due to our audit setup defect. Preserve every earlier outcome/cost, do not change task or judgment criteria, and stop further reruns if the additional attempt does not establish the final state.


### Reminders baseline final disposition

The additional attempt's repaired audit succeeded in 3.107 seconds after a 115.948-second host run. The main agent independently inspected its screenshot: the saved foreground title is `Mộc Benchmark List`, not the required `MCP Benchmark List`. The audit shows File report benchmark incomplete; completed rows are hidden in that final view, while the earlier compact capture recorded their completion statuses. The exact-name failure alone excludes the attempt.

Stop baseline reruns after four preserved attempts. Report no verified Reminders baseline and no success-to-success ratio for that suite. This is an observed measurement result, not a reason to invent a successful comparison or alter the frozen assertion gate. Any bridge run requiring a different keyboard setup must name that setup difference explicitly.


### Weather bridge first attempt

Run `5983b886-9e04-470c-8db5-c8e66fbbac76` stopped inconclusively at the conditions guard. Selecting London previews its main screen but leaves the half-height Locations sheet open; the intended main-scroll swipe instead expanded that foreground sheet. The original script omitted Close. The correction adds an explicit Close action and forbids Locations at main-screen checkpoints and swipes.

The main agent independently inspected `screen-32.jpg`: London and 11° are visibly present above the sheet. The earlier 0.98/0.97 judgments therefore support their actual claims; they do not prove an unobstructed main view for the next action. This is a script guard/navigation defect, not a falsely passed complete run or a demonstrated wrong decisive assertion. Preserve the attempt, script, costs, and screenshot proof before rerunning the corrected script.


## Answer

Measurement is complete, including its negative results. [The comparison report](../../../docs/research/scripted-benchmarks.md), [numeric attempts/totals](../../../spikes/benchmarks/results/comparison.json), and [closed maintenance ledger](../../../spikes/benchmarks/authoring-ledger.json) record the source, outcomes, costs, timing scopes and gaps.

Weather passed its corrected 20-step bridge script; Contacts passed ten steps. Their host elapsed times were 147.576 and 106.099 seconds, against verified baseline times 130.079 and 93.329 seconds. Estimated bridge host costs were $0.4781435 and $0.3461475, plus Jev $0.0007655 and $0.0002292, against baseline host estimates $0.704526 and $0.976488. These observed model costs were lower; host elapsed times were longer. Weather's baseline includes build while the bridge starts installed. Permission, cache and simulator-preparation differences remain disclosed.

Reminders executed 17 steps to the independently observed correct title and three reminder states, but its count claim scored 0.87 and correctly left verification inconclusive. Its host took 127.887 seconds, with estimated host cost $0.3821485 plus Jev $0.0001329. No verified upstream Reminders baseline was established after four preserved attempts, so no ratio is reported. No repeated model call or threshold/claim change was used to turn the uncertain result into a pass.

Per-step timings are retained in journals and the numeric export. The corrected three scripts produced six checkpoints with 18 correlated claims, one uncertain. Including the initial Weather failure adds two checkpoints/four supported judgments. No reference expiry occurred. The blind diagnosis task identified the planted defect from report plus source.

The measured maintenance window was 2,136.046 seconds gross; excluding 518.735 seconds of timed host execution leaves 1,617.311 seconds of mixed setup, coordination, archiving and analysis. This is not pure active authoring. Initial drafting time/tokens and active authoring time/tokens remain unknown. No total-savings or break-even claim is supported.

The main agent accepts these as completed exploratory measurements under the owner's release delegation. The invalid Reminders baseline and conservative abstention are explicit prerelease limits; they do not change the accepted fixed assertion experiment or claim universal reliability. The production spec and release notes carry those limits. Publication and downloaded-asset verification remain operational release gates.

Final release review identified one promised measure still missing: a prepared-app Weather baseline matching the bridge's no-build timing scope. The main agent reopened this ticket to collect a separately labelled variant with the same UI task and an already installed app, preserving the official build-inclusive result. No further Reminders attempt is authorized.


### Final closure: matched Weather timing

The single prepared-app Weather baseline succeeded: 90.449 seconds, 14 host calls, estimated host cost $0.737118, with the same UI task and no app build/install inside the timer. It used the existing dedicated simulator and preserved the official build-inclusive baseline separately. Prompt/suite diffs, starting-state proof and final UI capture are recorded in the variant manifest. The bridge's 147.576 seconds and estimated combined cost $0.4789090 show fewer calls/lower observed model cost and longer host elapsed time in this matched timing scope. No repeated run was used to select a nicer time. This closes the final promised measurement; all known limitations above remain.
