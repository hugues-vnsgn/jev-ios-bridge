# Data handling

**The rule:** use test data in apps you control. Don't run the bridge against real user accounts or production data. Text on screen that someone else wrote can try to steer Jev's judgment.

## What leaves your Mac

**To TypeSafe (Jev), at checkpoints only:**
- **every visible element on that screen:** role, label, value, identifier, position, and state. That includes text your script typed into fields. Secure fields show dots, not their contents. On Android, a password field shows one dot per character, both to Jev and in the report's `typedFields`.
- **the checkpoint's claims.**

Nothing is sent for action or wait steps. Screenshots, logs, and your script's other values are never sent.

**To TypeSafe (Jev), at every decision in a `do` step** ([driven steps](13-driven-steps.md#what-goes-to-typesafe), experimental and off unless you turn it on): the same screen text as at a checkpoint, the step's intent and `doneWhen`, the script's `goal`, the last two actions, and the list of possible actions. Typed values are masked as `⟦value:<key>⟧` in all of it. A `localOnly` step, and a screen that matches a `localOnlyScreens` rule, is never sent. In a script with `do` steps, checkpoints follow the same rules: typed values are masked in their screen text and claims, and a checkpoint on a local-only screen isn't sent (`LOCAL_ONLY_CHECKPOINT`).

**To your host agent (Claude, so Anthropic):**
- the script you submit, including its literal values. A value written as `{ "fromEnv": NAME }` stays in the bridge's environment: Claude sees only the variable's name ([script format](reference/script-format.md#values-from-the-environment));
- the final report, with script values masked;
- the watch URL, which ends up in the conversation transcript.

**The TypeSafe API key** goes only to TypeSafe. The device-layer processes the bridge starts run without it, including `adb` on Android.

**On Android, nothing goes anywhere else.** The bridge never runs mobilecli ([Android setup](12-android-setup.md#one-ui-tool-at-a-time)), so there's no mobilecli telemetry and no cloud call. About other connected devices it reads only the device list (`adb devices -l`), `adb`'s list of port forwards (`adb forward --list`, keeping only the run's device), and, when the device's name isn't a listed serial, each running emulator's AVD name (`ro.boot.qemu.avd_name`). It copies only mobilecli's device agent onto the one device the run uses. The agent listens only on the device's own local socket, which the bridge reaches through an `adb forward` on your Mac.

## What stays on your Mac

- **Evidence:** `.jev-runs/<run-id>/`: `report.json`, `run.jsonl`, and screenshots. It's readable only by you, and it's out of git (the evidence root gets a `.gitignore` containing `*`). It's kept until you delete it. Screenshots are **not** masked.
- **The app's own logs:** MobileBuildMCP writes them under `~/Library/Developer/MobileBuildMCP/workspaces/<workspace>/logs/` (readable only by you) and deletes them after about three days. **Apps can log tokens or personal data.** A debug build that logs every network request will leave those requests in these files. The log pane masks only your script's values.
- **The app's own logs on Android:** the bridge writes the app's `logcat` output (its own uid only) to `$TMPDIR/jev-android-logs/<run-id>.log`. The file is readable only by you, and the next Android run deletes log files older than 3 days. As on iOS, the file isn't masked: whatever the app logs is in it.
- **Intent extras** (`app.intentExtras`) are recorded as written in `run.jsonl` and `report.json`, like `launchArgs`. They aren't masked, except for a script value inside one, and the value of a key named exactly `authorization`, `apiKey`, `api_key`, `password` or `token` (case doesn't matter). A key such as `authToken` is kept in clear, so don't put secrets in them.
- **The watch page** is served on `127.0.0.1`. Its token opens one run, only while the bridge process is alive. Anyone on your Mac with the URL can read that run's evidence during that time.

A value from the environment is still typed on screen. A password field shows dots, so a password never reaches TypeSafe; a username shown on screen does, at a checkpoint, like any visible text.

## Masking and its limits

The bridge replaces your script's values, and the TypeSafe key, with `[REDACTED]` in `run.jsonl`, and with `[value:<key>]` in the log pane. Transformed copies aren't caught, such as a value shown in capitals. Very short values over-mask: a one-letter value masks that letter everywhere.

## Non-ASCII typing on Android goes through the clipboard

On Android, a typed value that isn't plain ASCII is pasted through the device clipboard, which the bridge clears afterwards. The keyboard may keep its own copy as a clipboard suggestion anyway, so the value can stay on the device after the run. Don't type real secrets that way. ASCII values are typed directly and never touch the clipboard. [Script format](reference/script-format.md#how-android-types-values) has the details.

## What TypeSafe says about your data

This summarises TypeSafe's terms as checked on 2026-09-25: the [Privacy Policy](https://typesafe.ai/legal/privacy-policy) (updated 2025-11-19), [Master Customer Agreement](https://typesafe.ai/legal/mca) (2026-09-23), [Data Processing Addendum](https://typesafe.ai/legal/data-processing) (2026-04-24), and [docs](https://docs.typesafe.ai/legal.md). Read the current versions before using real data.

- **Training:** TypeSafe says it doesn't train models on your input without your prior consent, and that "Jev is not trained on customer requests or responses".
- **Retention:** data is kept "as long as reasonably necessary", including in backups. Telemetry derived from it can be kept and used to improve the service.
- **Deletion:** no self-service deletion. Zero data retention is available to enterprise customers through TypeSafe's sales team.
- **Where:** hosted in the United States.
- **Your responsibility:** you confirm you have the rights and consents for whatever you send, which here means whatever is on screen at a checkpoint.
