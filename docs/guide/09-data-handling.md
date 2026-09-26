# Data handling

**The rule:** use test data in apps you control. Don't run the bridge against real user accounts or production data. Text on screen that someone else wrote can try to steer Jev's judgment.

## What leaves your Mac

**To TypeSafe (Jev), at checkpoints only:**
- **every visible element on that screen:** role, label, value, identifier, position, and state. That includes text your script typed into fields. Secure fields show dots, not their contents.
- **the checkpoint's claims.**

Nothing is sent for action or wait steps. Screenshots, logs, and your script's other values are never sent.

**To your host agent (Claude, so Anthropic):**
- the script you submit, including its values;
- the final report, with script values masked;
- the watch URL, which ends up in the conversation transcript.

**The TypeSafe API key** goes only to TypeSafe. The device-layer processes the bridge starts run without it.

## What stays on your Mac

- **Evidence:** `.jev-runs/<run-id>/`: `report.json`, `run.jsonl`, and screenshots. It's readable only by you, and it's out of git (the evidence root gets a `.gitignore` containing `*`). It's kept until you delete it. Screenshots are **not** masked.
- **The app's own logs:** MobileBuildMCP writes them under `~/Library/Developer/MobileBuildMCP/workspaces/<workspace>/logs/` (readable only by you) and deletes them after about three days. **Apps can log tokens or personal data.** A debug build that logs every network request will leave those requests in these files. The log pane masks only your script's values.
- **The watch page** is served on `127.0.0.1`. Its token opens one run, only while the bridge process is alive. Anyone on your Mac with the URL can read that run's evidence during that time.

## Masking and its limits

The bridge replaces your script's values, and the TypeSafe key, with `[REDACTED]` in `run.jsonl`, and with `[value:<key>]` in the log pane. Transformed copies aren't caught, such as a value shown in capitals. Very short values over-mask: a one-letter value masks that letter everywhere.

## What TypeSafe says about your data

This summarises TypeSafe's terms as checked on 2026-09-25: the [Privacy Policy](https://typesafe.ai/legal/privacy-policy) (updated 2025-11-19), [Master Customer Agreement](https://typesafe.ai/legal/mca) (2026-09-23), [Data Processing Addendum](https://typesafe.ai/legal/data-processing) (2026-04-24), and [docs](https://docs.typesafe.ai/legal.md). Read the current versions before using real data.

- **Training:** TypeSafe says it doesn't train models on your input without your prior consent, and that "Jev is not trained on customer requests or responses".
- **Retention:** data is kept "as long as reasonably necessary", including in backups. Telemetry derived from it can be kept and used to improve the service.
- **Deletion:** no self-service deletion. Zero data retention is available to enterprise customers through TypeSafe's sales team.
- **Where:** hosted in the United States.
- **Your responsibility:** you confirm you have the rights and consents for whatever you send, which here means whatever is on screen at a checkpoint.
