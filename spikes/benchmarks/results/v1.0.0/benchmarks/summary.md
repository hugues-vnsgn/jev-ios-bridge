# Benchmark checks (release checks 3, 4, and 9)

The three benchmark scripts each ran once through the v0.1.0 harness (`spikes/benchmarks/run-bridge.mjs`): Claude Code headless, `claude-opus-4-7`, `/test-ios`, and MCP. They ran on the dedicated simulator (iOS 26.4) on 2026-09-26, with `JEV_VERIFY_SCREENSHOT_AGREEMENT=1` and `JEV_LOG_PANE=off`.
- **Before the runs:** the "MCP Contact Benchmark" contact and the "MCP Benchmark List" left from the v0.1.0 runs were deleted through the UI, and Weather was reinstalled from the vendored source, to meet each script's preconditions.
- **Commits:** Weather and Contacts ran on candidate `579cdf4`. Reminders ran on `cd1c36d`, which adds only the measurement-mode fix (PR #19); normal runs are unchanged.
- **Speed:** "prepared" is the run's `durationMs` minus `phaseTimingsMs.verifyMs`, the measurement-only agreement captures.

| Script | v0.1.0 verdict | v1.0.0 verdict | Decisive claims | v0.1.0 prepared | v1.0.0 prepared | Change | Screenshot agreement |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Weather | passed | **passed** | all 0.97–0.98 | 107.7 s | 63.1 s | −41% | 20/20 |
| Contacts | passed | **passed** | identity 0.92, phone 0.97, email 0.98 | 74.8 s | 54.7 s | −27% | 9/10 |
| Reminders | inconclusive (`counts` 0.87) | **passed** (`counts` 0.90) | three status claims 0.97 | 91.2 s | 55.5 s | −39% | 17/17 |

- **Check 4 (blocking: none slower):** met. **Report-only (≥ 30% faster):** met by Weather and Reminders; Contacts is 27%.
- **Check 3 (blocking: verdicts match v0.1.0):** Weather and Contacts match. **Reminders changed from inconclusive to passed.** Its `counts` claim ("exactly two completed and one incomplete reminder, with no additional reminders") is true of the screen and scored 0.90, exactly at the bound; in v0.1.0 it scored 0.87. The phase 3 experiment measured this claim at 0.86–0.88 across identical requests. So the change comes from run-to-run noise on a borderline claim, possibly helped by v2's scroll-bar lines, and not from ADR-0004. Per the release spec this goes to the owner.
- **Reminders first attempt** (`reminders-scripted-bridge-1790406764664`): inconclusive, `SCREEN_CHANGED` at `beginSecond`. The measurement mode's extra capture left the step holding stale element references while a completed reminder animated. That was a bug in the measurement aid, fixed in PR #19 (captures again until the screenshot agrees), and the check was run once more. Normal runs never take that capture.
- **Contacts:** the only agreement miss was step 1, `openNewContact`, captured while Contacts was still settling after launch.
- **Script fix:** `contacts-scripted.json` dropped a vacuous `{"role": "alert"}` absent selector; see [script-fixes.md](script-fixes.md).

## Cost (check 9)

Jev `jev-1.13.0` input costs $0.042 per million tokens, and output is free ([TypeSafe models](https://docs.typesafe.ai/models.md), checked 2026-09-26; unchanged from `spikes/benchmarks/jev-pricing.json`).

| Run | Jev input tokens | Checkpoints | Jev cost |
| --- | ---: | ---: | ---: |
| Weather | 18,335 | 4 | $0.00077 |
| Contacts | 5,456 | 1 | $0.00023 |
| Reminders | 3,375 | 1 | $0.00014 |
| BFSOne Compose scripts (5 judged) | 21,001 | 7 | $0.00088 in total |

Across all 13 judged checkpoints, the average was 3,705 input tokens, which is **$0.00016 per checkpoint**. Host-model cost (the harness's Claude Code estimate) was $0.34–$0.51 per benchmark run. It depends on the developer's plan and isn't part of the bridge's cost.
