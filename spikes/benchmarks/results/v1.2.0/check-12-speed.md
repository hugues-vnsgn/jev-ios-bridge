# Check 12: Android speed (report-only)

From the formal check 3 (Android 16) and check 4 (Android 12) runs of candidate `93c6ac7` (`src` tree `904c6c8`), one run each, from each run's `run.jsonl`. There's no target.

| Emulator | Script | Verdict | Run (s) | Prepare (s) | Actions | Mean tap/swipe (s) | Replace text (s) |
|---|---|---|---|---|---|---|---|
| Android 16 | android-cmp-number-input | passed | 6.5 | 1.4 | 2 | 0.95 | 2.35 |
| Android 16 | android-settings-list-swipe | passed | 5.5 | 1.8 | 1 | 2.29 | – |
| Android 16 | android-settings-search | passed | 10.9 | 1.4 | 4 | 2.01 | 1.79 |
| Android 16 | android-twin-ambiguous | inconclusive | 2.7 | 1.4 | 0 | – | – |
| Android 16 | android-twin-pass | passed | 6.3 | 2.0 | 3 | 0.66 | – |
| Android 16 | diagnostic-app-android | failed | 9.2 | 3.6 | 3 | 0.90 | – |
| Android 12 | android-cmp-number-input | passed | 4.7 | 1.0 | 2 | 0.94 | 1.20 |
| Android 12 | android-settings-search-vi | passed | 7.7 | 0.9 | 4 | 1.41 | 1.14 |
| Android 12 | diagnostic-app-android | failed | 5.7 | 1.2 | 3 | 0.91 | – |

- **Run** is the bridge's own duration, from the `verdict` event. Prepare covers the tools check, the device lease, the agent check, the device checks, the restart and the agent start. Each action's time includes the settle rule's two or more captures.
- **Replace text** covers the tap to focus, `ctrl+a`, backspace and typing, then the settle. `settings-search-vi` types through the clipboard.

- **Capture and settle on their own:** a step's own settled capture, with no action in it, took 0.31 to 2.22 s; the 2.22 s was the first screen after a launch. Steps after an action reuse the screen that action settled, so most cost nothing extra. A single capture inside the settle rule wasn't timed separately. The per-run numbers are in [run-excerpts.md](run-excerpts.md).
