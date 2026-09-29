# Evidence plan and release gates for v1.2.0

Type: grilling
Status: open
Blocked by: 04, 05

## Question

What must be true before v1.2.0 ships?

- Which scripts run on which apps (the Android twin app with its planted failure, `cmp` or `cmp-test`, Settings), with which expected verdicts, one run each.
- What real phones get in v1.2.0: "untested" wording, and the checks to run once the Xiaomi is free.
- Whether iOS regressions are re-checked (the three benchmark scripts), and contract tests.
- A clean install of the plugin and tarball on a Mac with the Android SDK, and what the quickstart walkthrough covers.
- **Speed:** whether v1.2.0 sets a speed target or only reports the numbers. Measured: a capture takes 0.4–0.8 s, the first capture after an action 0.55–0.72 s, and typing 100 characters 1.2–3.1 s.
- **Android 12:** which runs repeat on the `jev-actions-api31` emulator, and a non-English typing check (for example Vietnamese text in the twin app or a probe field).
