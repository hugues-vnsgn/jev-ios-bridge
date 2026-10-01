# Run excerpts (v1.2.0 release checks)

The run folders (`check-*/runs/`) stay out of git on purpose: they hold screenshots and app logs. This file copies the numbers the summary and `check-12-speed.md` rely on from each run's local `run.jsonl`. Times are in seconds.

- **Observe:** a step's own settled capture (the settle rule's two or more captures), from each `step` event's `observeDurationMs`. A 0.00 means the step reused the screen its previous action had already settled.
- **Actions:** each action's `actDurationMs`, which includes its settle.
- **Claims:** each checkpoint claim's probability.

| Check | Output file | Run | Verdict (reason) | Run | Prepare | Observe per step | Actions | Claims |
|---|---|---|---|---|---|---|---|---|
| check-03 | `android-cmp-number-input-Medium_Phone_API_36.1.txt` | `5912e6a7` | passed (ALL_CHECKPOINTS_PASSED) | 6.50 | 1.44 | 1.12, 0.00, 0.00 | 0.95, 2.35 | dong 0.99 |
| check-03 | `android-settings-list-swipe-Medium_Phone_API_36.1.txt` | `dca41109` | passed (ALL_CHECKPOINTS_PASSED) | 5.51 | 1.75 | 0.78, 0.00 | 2.29 | about 0.99 |
| check-03 | `android-settings-search-Medium_Phone_API_36.1.txt` | `e9ae5f73` | passed (ALL_CHECKPOINTS_PASSED) | 10.87 | 1.35 | 1.01, 0.00, 0.00, 0.00, 0.00 | 2.49, 1.79, 1.78, 1.75 | off 0.97 |
| check-03 | `android-twin-ambiguous-Medium_Phone_API_36.1.txt` | `cc1b7ad5` | inconclusive (GUARD_AMBIGUOUS) | 2.73 | 1.41 | 1.16 | – | – |
| check-03 | `android-twin-pass-Medium_Phone_API_36.1.txt` | `de366024` | passed (ALL_CHECKPOINTS_PASSED) | 6.25 | 1.96 | 1.11, 0.00, 0.00, 0.31, 0.00 | 0.65, 0.68, 0.65 | summary 0.99; title 0.98 |
| check-03 | `diagnostic-app-android-Medium_Phone_API_36.1.txt` | `6d3c54dc` | failed (ASSERTION_FALSE) | 9.16 | 3.60 | 2.22, 0.00, 0.00, 0.00 | 1.12, 0.93, 0.65 | total 0.02 |
| check-04 | `android-cmp-number-input-jev-actions-api31.txt` | `8699b2c3` | passed (ALL_CHECKPOINTS_PASSED) | 4.68 | 0.96 | 1.00, 0.00, 0.00 | 0.94, 1.20 | dong 0.99 |
| check-04 | `android-settings-search-vi-jev-actions-api31.txt` | `e470b284` | passed (ALL_CHECKPOINTS_PASSED) | 7.66 | 0.91 | 0.77, 0.00, 0.00, 0.00, 0.00 | 1.82, 1.14, 1.37, 1.06 | off 0.97 |
| check-04 | `diagnostic-app-android-jev-actions-api31.txt` | `ddb86e3e` | failed (ASSERTION_FALSE) | 5.68 | 1.15 | 1.11, 0.00, 0.00, 0.00 | 0.93, 0.92, 0.90 | total 0.02 |
| check-05 | `run.txt` | `5e019f84` | inconclusive (APP_EXITED) | 6.43 | 2.64 | 1.20, 0.00, 0.00 | 0.69, 1.60 | – |
| check-07 | `diagnostic.txt` | `23b7a726` | failed (ASSERTION_FALSE) | 9.31 | 1.35 | 1.05, 0.93, 0.88, 0.89 | 1.09, 1.09, 1.14 | total 0.02 |
| check-14 | `android-twin-pass-Medium_Phone_API_36.1.txt` | `62c181a4` | inconclusive (DEVICE_BUSY) | 0.08 | 0.07 | – | – | – |
| check-15 | `run2.txt` | `37c3e1c9` | passed (ALL_CHECKPOINTS_PASSED) | 6.93 | 2.00 | 1.15, 0.00, 0.00, 0.31, 0.00 | 0.92, 0.93, 0.66 | summary 0.99; title 0.98 |

Check 7's Reminders, Weather and Contacts runs went through the benchmark harness, and their run folders weren't kept, so their per-claim scores (including Reminders' 0.89) can't be re-checked. Their committed summaries (`check-07/*-scripted-bridge-*.json`) record each verdict and reason.
