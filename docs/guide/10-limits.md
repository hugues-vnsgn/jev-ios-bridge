# Limits

What 1.0 does not do, or does less well than you might expect.

## Scope

- **Simulators only,** on a Mac. Real iPhones aren't supported.
- **You run it,** or your agent does. It isn't set up to run in CI or from hooks.
- **Scripts only.** The bridge never chooses actions; you or Claude write the steps.
- **Claude Code is the tested host.** Codex works through the same MCP server and skill, as best effort.
- **The app must already be installed** and its data arranged. The bridge restarts it each run but never builds, installs, seeds, or resets it.

## Judgment

- **English screens only.** Jev is less accurate on other languages, and 1.0's assurance covers English screen text.
- **Only what's on screen, as text.** Jev can't use screenshots, hidden state, history, or source code. See [write claims](05-writing-claims.md).
- **Near the bounds, answers vary.** Identical requests have differed by up to 0.07. A claim close to 0.9 or 0.1 can land on either side from run to run, so write claims that aren't close. The Reminders benchmark's count claim is the example: 0.87 (inconclusive) in v0.1.0, and 0.90 (passed) in the 1.0 check.
- **Typing can drop a keystroke.** In one Compose release check, MobileBuildMCP typed "Contan" for "Contain". Guard on the typed text in the next step, so a dropped key stops the run as inconclusive instead of failing a claim.
- **Prompt injection:** text on screen can try to steer Jev. Test with data you wrote.
- **Measured accuracy is small-sample.** In the project's frozen 24-screen test and 300 archived judgments, no claim was confidently wrong at 0.9/0.1. That's encouraging, but it isn't a guaranteed error rate.

## Speed and cost

- **It can be slower than letting Claude drive the simulator directly.** The bridge captures and checks the screen before every step, and that's where the time goes.
- **Measured on 1.0** (one run each, reference Mac, prepared app, excluding build and install):

  | Script | v0.1.0 | v1.0.0 |
  | --- | ---: | ---: |
  | Weather | 107.7 s | 63.1 s (−41%) |
  | Contacts | 74.8 s | 54.7 s (−27%) |
  | Reminders | 91.2 s | 55.5 s (−39%) |

- **Cost per run:** Jev costs about $0.00016 per checkpoint (3,705 input tokens on average), and $0.0001–$0.0008 per run of the benchmark and Compose scripts, at TypeSafe's published $0.042 per million input tokens (output free) as of 2026-09-26. Your host agent's cost depends on your plan and isn't included; in the benchmark harness, Claude Code cost $0.34–$0.51 per run.
- **Writing scripts takes time,** and that time hasn't been measured. The worked examples and `/test-ios` are there to make it faster.

## Input and devices

- **Typing:** printable US-keyboard text only, and no value may start with a hyphen (a limit of the pinned MobileBuildMCP).
- **One run per simulator at a time.**

## Compose Multiplatform

- Tested on Compose Multiplatform 1.9.0 and 1.11.1. Use **1.12.1 or later**: earlier versions can crash under accessibility polling.
- **Not tested:** `heading()` semantics, radio buttons with real selection semantics, SwiftUI navigation or tab bars wrapped around Compose screens, and native text input mode (`usingNativeTextInput`).

## Known behaviours not fixed in 1.0

- **A wait's `guard` must hold at every capture,** not just at the start.
- **A run started by another bridge process** shows as `interrupted` when you read it before it finishes.
- **Cancelling during cleanup** turns an already-recorded `failed` into `inconclusive`. Nothing is final until the verdict is written.
- **MCP errors are generic** ("Bridge operation failed…"). The CLI prints specific ones.
- **Short typed values over-mask** the evidence.
- **Reuse of MobileBuildMCP's post-action capture is off.** It can report a screen as settled mid-transition, so every step captures the screen fresh instead.
