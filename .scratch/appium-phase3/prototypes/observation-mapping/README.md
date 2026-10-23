# Observation mapping prototype

Open `index.html` directly. It contains its data, screenshots, and scripts. It needs no server or network.

This is throwaway evidence for [ticket 05](../../issues/05-observation-mapping.md). The owner and Claude root choose the contract. No Phase 3 adapter behavior is implemented here.

Android has current Appium and current agent captures of four states on two pages. The normalizer converts XML attributes into the existing Android agent-tree shape, then calls `mapAndroidTree`. All 35 resulting rows match the separately captured current agent output, ignoring capture-local references. The production observation renderer supplies the displayed text.

The single iOS retry succeeded after the runtime remount completed. CoreSimulator.log records that the original boot was forcibly shut down because its runtime volume was unmounting. The retry required a stable current runtime mount and two live Booted observations without changing capabilities. Four current iOS states replace the historical tabs. The live MobileBuildMCP attempt exited unsuccessfully, so corresponding committed corpus fixtures provide the baseline. Their device is 440 × 956 points, versus 402 × 874 for current Appium. Current source settings readback is proven. Idle and quiescence configuration is identified from the frozen sources; native WDA idle settings were not read back. The HTML marks this limit.

To run the rough normalizer from the worktree root after `npm ci`:

```sh
node --import tsx .scratch/appium-phase3/prototypes/observation-mapping/normalize.mjs android .scratch/appium-phase3/prototypes/observation-mapping/samples/android-choose-none.xml
```

For iOS, use `ios` and an iOS sample. Its role mapping, action synthesis, and `name` as an identifier are unverified candidates. `name` can represent an identifier or a label fallback. Unknown fields stay unknown. The renderer receives `truncated: false` to display the candidate rows; that is not a completeness verdict.

The HTML compares raw strict uniqueness, today's selector with `mobilebuildmcp-2.7.1`, and today's selector without that rule. Synthetic cases exercise the imported production selector without device input. The actual Android parent and text child demonstrate the existing `selectable: false` rule. The depth comparison uses real, well-formed captures at settings 2 and 70.

The HTML reports five source captures per Android state, their median and range, PNG latency, inclusive MCP latency, and a separate cold proxy trace. The trace locates the wait in UiAutomator2's `GET /source`; device-side idle, traversal, and serialization costs remain unresolved. No platform speed comparison is claimed.

Raw screenshots, logs, settings readbacks, capture scripts, attempt diagnoses, source traces, and shutdown receipts are local at `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P05-evidence/`. Capture scripts are preserved under its `scripts/` directory and expect `/tmp/p05/config.json`. They are instruments for this exact frozen private pair, not production runners. No Jev call, admission-store operation, app rebuild, or other-device operation occurred.

Unreached cases are independent duplicate controls, invisible nodes, passwords, empty hints, scrolling lists, large trees, and continuous screen changes. Current iOS role and field parity, reference issuance and session binding, completeness refusal, source settings, and alias policy remain owner decisions.


## P19 fixture evidence

The HTML adds 15 P19 tabs from live fixture captures. Android fields, scrolling, duplicates, and the alias screen match today's agent on all 51 normalized rows. iOS baseline parity remains unknown because the real driver defaults to the real admission store. The three locked iOS mapping gaps are corrected in this throwaway normalizer.

The iOS alias proof dispatches each same-frame reference through one W3C centre sequence and records one `alias.inner` event per reference. The production resolver source is identical apart from its two capability-token comparisons, renamed to `same-frame-button-v1`. The unmodified production resolver rejects that new token. Android exposes one normalized alias reference, so its two-reference equivalence is unproven. The root decides the contract.

The final iOS tree reaches XML depth 45 and renders. Its deeper variant reaches the pinned depth 50 and refuses as incomplete. Android reaches depth 70 and refuses. The first nested-view iOS fixture timed out at 10 seconds and left a pending native snapshot. Its failed run remains in the evidence directory. The final fixture uses a virtual accessibility-container chain.

Android pre-filled and secure replacements each produced one native change event. A fresh capture shows the field's own value. Secure text is masked in fixture UI and retained output. Continuously changing screens return `settled: false` inside the 3-second cap on both platforms. The first iOS loop overran to 3.092 seconds; the retry bounds a final source by the remaining time. These timings describe these captures, not comparative app performance.

Raw XML, native logs, source and wall timings, fixture hashes, resolver provenance, both failed checks, final shutdown receipts, and the rerunnable proof scripts remain in `/Users/hugues_mini/.codex/reports/jev-ios-bridge/phase3-build/P19-evidence/`. Both exact private devices are offline. This is throwaway evidence, with no production adapter changes.
