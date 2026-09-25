# PROTOTYPE: developer guide outline for v1.0.0

**Accepted by the owner on 2026-09-25, as drafted.** The decisions are recorded in the "Developer guide outline" ticket.

Throwaway draft for the "Developer guide outline" ticket, written so the owner can react to it. It is not the guide itself: Codex writes that from whatever this outline becomes. Each page gets one line on its job, then the points it must cover.

**Who reads it:** a native iOS (SwiftUI/UIKit) or Compose Multiplatform developer using Claude Code, and the Claude session that writes scripts for them. The guide is written for both, so `/test-ios` can point Claude at the pages it needs.

## Page set and reading order

```text
docs/guide/
├── README.md                 # index: what the bridge is for, reading order, who it's not for
├── 01-quickstart.md          # first run in ~15 minutes, on the diagnostic app
├── 02-prepare-your-app.md    # simulator, install, test data, launch state, debug entry points
├── 03-identifiers.md         # SwiftUI, UIKit, and Compose: making elements selectable
├── 04-writing-scripts.md     # steps, selectors, guards, waits, values
├── 05-writing-claims.md      # checkpoint claims Jev can judge confidently
├── 06-running.md             # CLI, MCP + /test-ios, watch page, log pane, limits, cancelling
├── 07-reports-and-evidence.md# verdicts, report.json, evidence folder, exit codes
├── 08-troubleshooting.md     # by reason code
├── 09-data-handling.md       # what leaves the machine, what stays local
├── 10-limits.md              # the honest list
├── 11-stability.md           # what 1.x promises; upgrading from 0.1.0
├── examples/
│   ├── swiftui-weather.md    # worked SwiftUI example, annotated
│   └── compose-gallery.md    # worked Compose example, annotated
└── reference/
    ├── script-format.md      # every field, version 1
    ├── reason-codes.md       # the bridge-owned list
    └── report-json.md        # the frozen report fields
```

Reading order for a new developer: README → 01 → 02 → 03 → 04 → 05 → 06 → 07. Everything after that is looked up when needed. Claude authoring a script reads 03, 04, 05, and `reference/script-format.md`.

### README.md: the index

- What it's for: **repeatable checks**, meaning scripts kept in your repo and re-run after changes, like UI tests that read the screen the way a person would.
- Not for: exploring an app without a script, real iPhones, CI (not in 1.0).
- Where it's slower: it can be slower than letting Claude drive the app directly. What you get in return is cost per run, recorded evidence, and verdicts that repeat.

### 01-quickstart.md

- Prerequisites: a Mac, Xcode, Node 24+, a TypeSafe API key, one simulator set aside for the bridge.
- Install the GitHub release tarball into your project (no npm registry).
- Put `TYPESAFE_API_KEY` in a private `.env` and load it by path.
- Choose the simulator (`JEV_DEVICE_UDID` or `.mobilebuildmcp/config.yaml`).
- Register the MCP server, and copy `/test-ios` into `.claude/skills/`.
- Build and install the diagnostic app, run its script, and read the **failed** report that points to the $3 total.

### 02-prepare-your-app.md

- The bridge doesn't build, install, seed, or reset apps. You do that, for example through MobileBuildMCP.
- The app restarts at the start of each run. Scripts begin from whatever screen the app shows after launch.
- Test data: use synthetic data in an app you control (prompt-injection risk; see 09).
- **Debug entry points:** `app.launchArgs` opens a debug-only screen, and skips login or network, so runs repeat. The BFSOne `-of-evidence-gallery` pattern is the example.
- Permission popups and splash timers: handle them in the app's debug path, or with an explicit wait.

### 03-identifiers.md

- How to see what the bridge sees: a MobileBuildMCP `snapshot-ui` capture, and the fields it gives (identifier, role, label, value).
- **SwiftUI/UIKit:** `.accessibilityIdentifier`, and labels.
- **Compose Multiplatform:** `Modifier.testTag` becomes the identifier, with no opt-in needed since 1.8.0. 1.12.1+ is recommended; evidence was tested on 1.9.0 (BFSOne) and 1.11.1 (`cmp`).
- Rules for all frameworks:
  - Put the tag on the element that acts, not on its wrapper.
  - Make tags unique per instance. Components that tag themselves (`numberInput.field`, `of-field-clear`) repeat on every instance.
  - Compose buttons repeat their label on a text child, so select by identifier, or by role plus label.
- Empty fields: Compose leaves out `value`, while native fields report their placeholder. You can't select or assert on emptiness.
- Off-screen Compose elements lose their labels, so scroll first.

### 04-writing-scripts.md

- The shape: `"version": 1`, `app` (with `bundleId` and optional `launchArgs`), `values`, and `steps`.
- Step kinds: tap, replaceText, swipe, wait, and checkpoint. Every step has a guard.
- Guards prove which screen you're on. A lone text field doesn't identify a screen. Sheets and dialogs leave the background, or hide it, in the capture.
- Typed values: put them in `values`; US-keyboard printable text only; no leading hyphen.
- Patterns: dialogs and sheets, scrolling long lists, keyboards and replace-all, and waiting out animations.

### 05-writing-claims.md

- Jev reads the screen's text, not the screenshot.
- Claim only what's visibly printed. Avoid empty fields, counts whose list end isn't shown, and "it was saved".
- The verdict rules: 0.9 and 0.1 are fixed. A confidently false claim fails the checkpoint even when other claims are uncertain. Each checkpoint is judged once.
- If a claim comes back uncertain, add evidence (scroll to the list's end, then add a new checkpoint). Don't re-run and hope.
- English screens only.

### 06-running.md

- CLI: `run`, `run --json`, `report`, the limits flags, exit codes 0/1/2/3 (plus 130/143).
- MCP: `start_scenario`, `get_report`, `cancel_run`, and how `/test-ios` uses them.
- The watch page, and the **log pane** (details come from the "Live log pane" ticket).
- Cancelling, and what a retained device lock means and how to clear it safely.

### 07-reports-and-evidence.md

- What passed, failed, and inconclusive each mean.
- The prose report versus `report.json`: only `report.json` is frozen.
- The evidence folder: `run.jsonl`, `report.json`, `screen-N.*`, where it lives, and that you delete it yourself.

### 08-troubleshooting.md

One entry per common reason code (`GUARD_AMBIGUOUS`, `GUARD_MISSING`, `TARGET_UNAVAILABLE`, `DEVICE_ERROR`, uncertain claims, a retained lock), each with what it means, the usual cause, and the fix.

### 09-data-handling.md

- What goes to TypeSafe (screen text and claims) and what stays local (screenshots, logs, evidence).
- Redaction and its limits.
- Prompt injection through on-screen text.
- The exact wording comes from the "Data-handling statement for outside developers" ticket.

### 10-limits.md

- Slower than driving the app directly.
- English screens only; US-keyboard input.
- Simulator only.
- Codex support is best effort.
- Authoring cost unmeasured.
- Compose areas not tested: `heading()`, SwiftUI navigation or tab bars around Compose, native text input mode.
- Cost per run: a number, once tuning has settled it (still fog on the map).

### 11-stability.md

- What 1.x promises, from ADR-0005, in plain words.
- Upgrading from 0.1.0:
  - add `"version": 1`;
  - drop `value: ''` selectors;
  - "could not start" is now exit code 3;
  - a false claim now fails even beside uncertain claims.

### examples/

- **SwiftUI: the Weather app** (vendored MobileBuildMCP example, MIT), using the existing `weather-scripted.json` benchmark script with notes on each step. Readers can build it from the repo.
- **Compose: the BFSOne gallery**, a cut-down, annotated copy of one evidence script. Outside readers can't build BFSOne, so the page says so, and teaches through the script and its captures.

## What moves where

- `README.md`: shrinks to a pitch, install, a link to `docs/guide/`, and current status. The v0.1.0 experiment history moves to `docs/releases/v0.1.0.md`.
- `docs/usage.md`: split across 01, 02, 04, 06, 07, and 09, then deleted. Its content goes to the guide.
- `/test-ios`: stays short (the steps Claude follows), and links to 03, 04, 05, and `reference/script-format.md` through the **installed package path** (`node_modules/jev-ios-bridge/docs/guide/...`). A copied skill can't use relative links, and installed paths match the installed version.

## What ships in the tarball

`dist/`, `skills/`, `README.md`, `docs/guide/`, `LICENSE`, and `CHANGELOG.md`. Not included: ADRs, research, spikes, and the example app sources, which are linked to at the release tag on GitHub instead.

**The repo has no license today.** There is no LICENSE file, and `package.json` has no `license` field and is marked `private`. Other developers can't lawfully use it until one is chosen.
