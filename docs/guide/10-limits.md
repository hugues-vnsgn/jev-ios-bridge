# Limits

What the bridge does not do, or does less well than you might expect.

## Scope

- **On iOS, simulators only,** on a Mac. Real iPhones aren't supported.
- **On Android, emulators and phones,** from a Mac. **Real Android phones are untested:** they're supported in code, but 1.2's checks ran only on emulators.
- **You run it,** or your agent does. It isn't set up to run in CI or from hooks.
- **Scripts only.** The bridge never chooses actions; you or Claude write the steps.
- **Claude Code is the tested host.** Codex works through the same MCP server and skill, as best effort.
- **The app must already be installed** and its data arranged. The bridge restarts it each run but never builds, installs, seeds, or resets it.

## Judgment

- **English screens only.** Jev is less accurate on other languages, and 1.0's assurance covers English screen text. On Android, non-English text types exactly, but that doesn't extend the assurance.
- **Only what's on screen, as text.** Jev can't use screenshots, hidden state, history, or source code. See [write claims](05-writing-claims.md).
- **Near the bounds, answers vary.** Identical requests have differed by up to 0.07. A claim close to 0.9 or 0.1 can land on either side from run to run, so write claims that aren't close. The Reminders benchmark's count claim is the example: 0.87 (inconclusive) in v0.1.0, and 0.90 (passed) in the 1.0 check.
- **Typing can drop a keystroke.** In one Compose release check, MobileBuildMCP typed "Contan" for "Contain". Guard on the typed text in the next step, so a dropped key stops the run as inconclusive instead of failing a claim.
- **Prompt injection:** text on screen can try to steer Jev. Test with data you wrote.
- **Measured accuracy is small-sample.** In the project's frozen 24-screen test and 300 archived judgments, no claim was confidently wrong at 0.9/0.1. That's encouraging, but it isn't a guaranteed error rate.

## Speed and cost

- **It can be slower than letting Claude drive the device directly.** The bridge captures and checks the screen before every step, and that's where the time goes.
- **Measured on 1.0** (one run each, reference Mac, prepared app, excluding build and install):

  | Script | v0.1.0 | v1.0.0 |
  | --- | ---: | ---: |
  | Weather | 107.7 s | 63.1 s (−41%) |
  | Contacts | 74.8 s | 54.7 s (−27%) |
  | Reminders | 91.2 s | 55.5 s (−39%) |

- **Cost per run:** Jev costs about $0.00016 per checkpoint (3,705 input tokens on average), and $0.0001–$0.0008 per run of the benchmark and Compose scripts, at TypeSafe's published $0.042 per million input tokens (output free) as of 2026-09-26. Your host agent's cost depends on your plan and isn't included; in the benchmark harness, Claude Code cost $0.34–$0.51 per run.
- **Writing scripts takes time,** and that time hasn't been measured. The worked examples and `/test-ios` are there to make it faster.

## Driven steps

`do` steps are experimental. Jev reads only the screen's text, so it can't act on canvas drawing, web views, or system sheets the accessibility tree doesn't show. `tapAt` works on Android only for now. See [driven steps](13-driven-steps.md#limits).

## Input and devices

- **Typing on iOS:** printable US-keyboard text only, and no value may start with a hyphen (a limit of the pinned MobileBuildMCP).
- **Typing on Android:** any text except control characters. Non-ASCII text goes through the device clipboard, and the keyboard may keep it ([data handling](09-data-handling.md#non-ascii-typing-on-android-goes-through-the-clipboard)).
- **One run per device at a time.**

## Android

- **Android 12 (API 31) or later.** Older devices are refused with `DEVICE_UNSUPPORTED`.
- **Going to the home screen isn't detected.** An app that's sent to the background is still running, so it isn't `APP_EXITED`. The next guard fails instead, as on iOS.
- **A quick freeze may show as the step's own failure.** Android reports a frozen app only after about 5 seconds. After a failed step the bridge waits up to 1 second for the app's events, which catches a crash, but a step that fails before Android reports the freeze keeps its own reason, often `GUARD_MISSING`, instead of `APP_NOT_RESPONDING`.
- **An upper-case copy of a value isn't masked** in the log pane or `run.jsonl`, as on iOS.
- **Custom tabs and toggles without a selected or checked state** give uncertain claims. [Android setup](12-android-setup.md#custom-tabs-and-toggles-must-expose-their-state) shows the fix.
- **Two running emulators with the same AVD** are refused with `DEVICE_AMBIGUOUS`, when a script names that AVD.
- **Tried only on Apple silicon.** The device agent is the same in both of mobilecli's Mac builds, and the bridge checks its SHA-256 on either, but Android runs have only been tried on Apple silicon Macs.
- **One UI tool per device.** Another tool's UI-automation agent (a foreign agent) on the device makes the run refuse with `DEVICE_BUSY`.
- **Speed,** measured on 1.2 (one run each, on emulators, excluding build and install):

  | Script | Android 16 (`Medium_Phone_API_36.1`) | Android 12 (`jev-actions-api31`) |
  | --- | ---: | ---: |
  | twin-fail | 9.2 s | 5.7 s |
  | twin-pass | 6.3 s | |
  | twin-ambiguous | 2.7 s | |
  | cmp-number-input | 6.5 s | 4.7 s |
  | settings-list-swipe | 5.5 s | |
  | settings-search | 10.9 s | |
  | settings-search-vi | | 7.7 s |

  Preparing the device took 0.9 to 3.6 s. A tap or swipe, with its settle, took 0.7 to 2.3 s. Replacing a field's text took 1.1 to 2.4 s, including the clipboard path for Vietnamese. Capture and settle time weren't measured separately. A screen that keeps moving costs about 3 seconds plus one more capture: after 3 seconds the [settle](12-android-setup.md#animations-off-is-optional) rule starts no new capture, and uses the last one when it returns.

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
