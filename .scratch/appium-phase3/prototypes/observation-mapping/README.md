# Observation mapping prototype

Open `index.html` directly. It contains its data, screenshots, and scripts. It needs no server or network.

This is throwaway evidence for [ticket 05](../../issues/05-observation-mapping.md). The owner and Claude root choose the contract. No Phase 3 adapter behavior is implemented here.

Android has current Appium and current agent captures of four states on two pages. The normalizer converts XML attributes into the existing Android agent-tree shape, then calls `mapAndroidTree`. All 35 resulting rows match the separately captured current agent output, ignoring capture-local references. The production observation renderer supplies the displayed text.

The current iOS run is blocked. XCUITest failed session creation after the private simulator stopped booting. MobileBuildMCP could not find that private-set UDID. Two historical Appium XML samples and one historical screenshot from T04 are explicitly labeled. The corresponding committed MobileBuildMCP fixtures from `spikes/feasibility/corpus-v3/raw/` supply a historical baseline through production `parseSnapshot`. They were captured on 2026-09-24 on another device with a 440 × 956 point frame, versus 402 × 874 for Appium. They supply no current live parity, settings readback, or latency claim. The candidate adds label-derived identifiers and text values, emits a window role, and synthesizes actions that differ from those fixtures. The HTML marks those differences without choosing a mapping.

To run the rough normalizer from the worktree root after `npm ci`:

```sh
node --import tsx .scratch/appium-phase3/prototypes/observation-mapping/normalize.mjs android .scratch/appium-phase3/prototypes/observation-mapping/samples/android-choose-none.xml
```

For iOS, use `ios` and an iOS sample. Its role mapping, action synthesis, and `name` as an identifier are unverified candidates. `name` can represent an identifier or a label fallback. Unknown fields stay unknown. The renderer receives `truncated: false` to display the candidate rows; that is not a completeness verdict.

The HTML compares raw strict uniqueness, today's selector with `mobilebuildmcp-2.7.1`, and today's selector without that rule. Synthetic cases exercise the imported production selector without device input. The actual Android parent and text child demonstrate the existing `selectable: false` rule. The depth comparison uses real, well-formed captures at settings 2 and 70.

The HTML reports five source captures per Android state, their median and range, PNG latency, inclusive MCP latency, and a separate cold proxy trace. The trace locates the wait in UiAutomator2's `GET /source`; device-side idle, traversal, and serialization costs remain unresolved. No platform speed comparison is claimed.

Raw screenshots, logs, settings readbacks, capture scripts, attempt diagnoses, source traces, and shutdown receipts are local at `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P05-evidence/`. Capture scripts are preserved under its `scripts/` directory and expect `/tmp/p05/config.json`. They are instruments for this exact frozen private pair, not production runners. No Jev call, admission-store operation, app rebuild, or other-device operation occurred.

Unreached cases are independent duplicate controls, invisible nodes, passwords, empty hints, scrolling lists, large trees, and continuous screen changes. Current iOS role and field parity, reference issuance and session binding, completeness refusal, source settings, and alias policy remain owner decisions.
