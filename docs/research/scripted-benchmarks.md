# Scripted bridge measurements

Measured on 2026-09-25: Weather and Contacts bridge scripts passed; Reminders executed the requested state but returned inconclusive on an uncertain count assertion. No verified Reminders baseline was established. No total-cost or break-even claim is supported: initial script drafting was not metered. The measured maintenance ledger records later work separately.

## Method

Use the pinned MobileBuildMCP 2.7.1 benchmark tasks on this Mac, with Claude Opus 4.7 and iOS 26.4. The baseline host drives MobileBuildMCP directly; the bridge host submits one complete script through the clean-installed package and reads its report. Run each timed task without concurrent GUI/build work. Verify actual UI evidence rather than trusting a host's completion statement.

The baseline uses the upstream suggested tool sequence and `bypassPermissions`; the bridge host uses a restricted Skill/MCP allowlist. Upstream suites create their own temporary simulators. Bridge runs use the dedicated simulator with documented fixture preparation. Weather build is inside the upstream host task; the bridge starts with the app installed. These differences prevent treating all wall-clock numbers as identical scopes.

Host costs are Claude Code's API-price estimates, not subscription invoices. These are single-task observations with their recorded cache behavior, not controlled cold-cache averages. Report uncached input, cache creation, cache read and output separately. Jev uses the published $0.042 per million input-token rate, with free output, checked in [the pricing record](../../spikes/benchmarks/jev-pricing.json). Source, model, commands, and artifact hashes are retained below `spikes/benchmarks/`.

## Baseline outcomes

| Task | Verified host seconds | Total host calls | Uncached input | Cache creation | Cache read | Output | Estimated host cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Weather | 130.079 | 16 | 21 | 23,122 | 780,352 | 3,321 | $0.704526 |
| Contacts | 93.329 | 20 | 30 | 41,473 | 1,016,066 | 2,143 | $0.976488 |
| Reminders | No verified task completion | n/a | n/a | n/a | n/a | n/a | Report attempts separately |

Weather simulator setup took 23.88 seconds outside the host timer; Contacts setup took 22.99 seconds. Weather's successful retry recovered two batch-input errors. Its earlier attempt lacked AXe in the source checkout and could not perform the task. The supported AXe path override then supplied the exact verified binary used by the bridge.

The main agent checked Weather's raw captures for all seven settings, London/11°, precipitation/visibility, and the five detail values. Contacts' raw captures show the saved name, organization, phone digits and email with an Edit button, not an editor. The [Weather](../../spikes/benchmarks/results/weather-baseline-verified.json) and [Contacts](../../spikes/benchmarks/results/contacts-baseline-verified.json) artifacts bind those proofs to the prompts and raw results.

## Reminders baseline evidence gap

Four attempts are preserved. In the first, the typed call supplied `MCP Benchmark List`, but the captured field showed `Mộc Benchmark List`. The second showed the correct field before saving, but later compact captures omitted the saved title. The third added a read-only post-host audit, which failed to launch its CLI. Those outcomes do not establish a successful task.

For the fourth, the audit command was repaired and smoke-tested before another paid run. A local harness patch captured full accessibility data and a screenshot after the host timer stopped and before normal simulator deletion. Task prompt, suite, keyboard setup, and host actions stayed unchanged. This one extra attempt exceeded the upstream three-attempt recommendation because of our audit setup defect; no previous attempt or cost was discarded.

The fourth host took 115.948 seconds, followed by a 3.107-second read-only audit. Its saved screenshot plainly shows `Mộc Benchmark List`, so the exact-name requirement failed. Baseline reruns stopped. Do not calculate a successful-run speed or cost ratio for Reminders. The [audit patch and provenance](../../spikes/benchmarks/results/reminders-postrun-audit-seam.json) and attempt audit artifacts record the instrumentation and classification corrections.

## Bridge attempts and maintenance

The first Weather script reached the conditions check but stopped inconclusively. Selecting London left a half-height Locations sheet open. London and 11° were visible above it, supporting those two claims, but the subsequent swipe expanded the sheet instead of scrolling the main view. The script was corrected to close Locations explicitly and forbid that overlay at main-view steps. The original script, report, journal, screenshots and costs remain in [its archive](../../spikes/benchmarks/results/weather-bridge-attempt1/manifest.json).

The Reminders draft also required removing an extra open-list step: Save enters the new list directly. Its planned insertion/completion order differs from the upstream sequence so each incomplete-circle target stays unique. Report that difference even when the final requested state matches.

[The maintenance ledger](../../spikes/benchmarks/authoring-ledger.json) separates focused script work from mixed benchmark setup/audit repair and from unmetered initial drafting. A null authoring-token value is unknown, not zero. The final outcomes and phase timings follow. Machine-readable attempts and totals are in [comparison.json](../../spikes/benchmarks/results/comparison.json); per-step durations remain in the archived journals and [timing export](../../spikes/benchmarks/results/bridge-step-timings.csv).


### Verified Weather bridge run

The corrected 20-step script passed all four checkpoints in run `72682f2a-7057-482c-8c77-d3282f5090f4`. The main agent independently inspected the final screenshot: 78% chance, 10.7 mm, 6 hrs, 14 km and lightning None are visible. The archived script exactly matches the submitted host input, and report/journal/screenshots/metrics hashes were independently audited. [Evidence](../../spikes/benchmarks/results/weather-bridge-attempt2/manifest.json).

| Measure | Successful Weather bridge run |
| --- | ---: |
| Host process elapsed | 147.576 s |
| Prepared bridge execution | 107.670 s |
| Host MCP calls | 4 |
| Host uncached / cache creation / cache read / output tokens | 10 / 29,942 / 141,847 / 4,310 |
| Estimated host model cost | $0.4781435 |
| Jev input tokens | 18,227 |
| Estimated Jev cost | $0.0007655 |
| Prepare / observe / judge / act / cleanup | 2.436 / 51.515 / 3.473 / 49.018 / 0.938 s |
| Reference refreshes / expiries | 0 / 0 |

Observed model cost was lower than the successful baseline, while host elapsed time was longer. The scopes still differ: the baseline includes Weather build, and the bridge begins with an installed app. Most bridge execution time was device observation and action. The prior unsuccessful Weather script and unmetered initial authoring prevent treating this successful-run comparison as total savings.


### Verified Contacts bridge run

The ten-step script passed its saved-card checkpoint in run `ba16e0bc-81b9-4945-8f38-b3e5f69d6d91`, with probabilities 0.92 for identity/organization, 0.97 for phone and 0.98 for email. The saved card shows the exact name, organization words, phone digits and email, without entering an editor after save. The main agent independently inspected the saved-card screenshot; an independent archive audit matched the script, report, journal, screenshots and metrics. Cleanup completed and the lock was absent. [Evidence](../../spikes/benchmarks/results/contacts-bridge-attempt1/manifest.json).

Host elapsed time was 106.10 seconds with three MCP calls and an estimated host cost of $0.3461475. Jev used 5,456 input tokens, an estimated $0.0002292. The baseline took 93.329 seconds and an estimated $0.976488. As with Weather, the observed bridge model cost was lower and host elapsed time longer. Fixture preparation and initial authoring remain outside those run figures.


### Reminders: correct observed UI, inconclusive verification

The 17-step script reached the requested saved state in run `0fb5c786-d4ed-4b60-bfed-68a5452b533a`. The main agent and a second reviewer inspected the final screenshot: the exact `MCP Benchmark List` title, "2 Completed," File report benchmark incomplete, and Buy milk benchmark / Call team benchmark completed are visible, with no additional row. No keyboard setting was changed for this bridge run; its dedicated simulator had a different history from the fresh baseline devices.

Jev gave each individual status claim 0.97, but gave the combined exact-total/no-additional-reminders claim **0.87**. The fixed policy therefore returned **inconclusive / ASSERTION_UNCERTAIN**. No threshold, claim wording or model request was changed and the run was not repeated to obtain a pass. Cleanup completed and the lock was absent. [Evidence](../../spikes/benchmarks/results/reminders-bridge-attempt1/manifest.json).

| Measure | Contacts | Reminders |
| --- | ---: | ---: |
| Host process elapsed | 106.099 s | 127.887 s |
| Prepared bridge execution | 74.766 s | 91.173 s |
| Host MCP calls | 3 | 3 |
| Host uncached / cache creation / cache read / output tokens | 9 / 23,093 / 95,795 / 2,691 | 9 / 24,492 / 99,467 / 3,498 |
| Estimated host model cost | $0.3461475 | $0.3821485 |
| Jev input tokens | 5,456 | 3,164 |
| Estimated Jev cost | $0.0002292 | $0.0001329 |
| Prepare / observe / judge / act / cleanup | 2.214 / 28.167 / 1.456 / 41.845 / 0.898 s | 1.955 / 41.598 / 0.961 / 45.545 / 0.880 s |
| Reference refreshes / expiries | 0 / 0 | 0 / 0 |

There is no valid successful-run Reminders ratio: the baseline never established the task, and the bridge abstained despite the correct observed state. The inconclusive result is an intended policy outcome, not a passed verification.

## What these measurements support

The two verified pairs used fewer host calls and lower observed model-cost estimates through the bridge, but took longer in host elapsed time. Device observation and actions dominate bridge execution. These are single-run observations with different setup/build scopes and cache histories; they do not establish a universal speed or cost advantage.

The corrected three bridge scripts produced two passes and one inconclusive result. Their six checkpoints contain 18 correlated claims; one count claim was uncertain. Including the initial Weather script failure adds two checkpoints/four judgments, with the same one uncertain claim. No reference expiry was observed in these runs. Failed attempts, instrumentation repair, script maintenance and unknown initial authoring cost belong in any assessment of the effort; none can be treated as zero-cost work.


The closed maintenance window totals 2,136.046 seconds. Removing 518.735 seconds of timed host execution leaves 1,617.311 seconds of mixed setup, coordination, archival and analysis work. Treat that as elapsed session overhead, not pure active authoring. Initial drafting and active model-authoring tokens remain unknown. Two flow/guard edits are bound to before/after hashes and observed evidence.


## Matched prepared-app Weather baseline

A separately recorded variant closes the app-build timing gap. It launches the already installed Weather app, then performs the same steps 2–6 and verification rules. The custom suite removes build hints, keeps the same model, device backend, permissions and suggested UI sequence, and targets the existing dedicated simulator without creating or deleting it. Its default-settings/start-screen captures, prompt/suite hashes and exact diffs are preserved in [the variant manifest](../../spikes/benchmarks/prepared-weather/manifest.json). The official build-inclusive result remains unchanged.

The single measured run succeeded in **90.449 seconds**, with 14 total host calls (13 MCP), no tool errors, and estimated host cost **$0.737118**. Tokens: 24 uncached input, 33,372 cache creation, 674,356 cache read, and 2,644 output. The timer includes session defaults, launching the installed app and UI work; it excludes app build/install and operator setup. A read-only final capture after timing confirmed the precipitation values. That audit is outside the host timer and makes no additional model request.

Against this prepared-app baseline, the bridge's 147.576-second host run took longer and used fewer calls. Its estimated combined host/Jev cost was $0.4789090. This comparison now shares the no-app-build scope, while the documented permission/tool-sequence and cache-history differences remain. It is one observation, not an average or a total-cost claim.
