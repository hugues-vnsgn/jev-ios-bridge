# Reports and evidence

## The verdict

| Verdict | Meaning |
| --- | --- |
| **passed** | Every step ran, and every checkpoint claim was established (≥ 0.9). |
| **failed** | A checkpoint claim was confidently false (≤ 0.1). This is evidence that the app isn't in the state you claimed. |
| **inconclusive** | Verification didn't finish either way: an uncertain claim, a guard or target that didn't match, a limit reached, a cancellation, a device or TypeSafe problem. It is never a pass. |

The `reason` says which one: a code from the [reason-code list](reference/reason-codes.md). The recorded verdict is final; reading a report later never changes it.

## Two reports

- **The prose report** (printed by `run`, and returned by MCP's `get_report`) is written for people and agents. It lists the verdict and reason, the decisive checkpoint with each claim's probability, an excerpt of the screen text, and file names for the screenshot and log event. Its wording may improve between releases.
- **`report.json`** is the stable one. It's in the run's folder, printed by `run --json` and `report --json`, and its shape is frozen for 1.x. Parse this one in tools. [Field reference](reference/report-json.md).

## The evidence folder

Every run gets `.jev-runs/<run-id>/` in the directory you ran from, or under `JEV_RUNS_DIR`:

| File | Contents |
| --- | --- |
| `report.json` | The frozen report. |
| `run.jsonl` | Every event, one JSON object per line: `started`, `prepared`, `step`, `judgment`, `action`, `checkpoint`, `error`, `verdict`. |
| `screen-N.jpg` or `.png` | The screenshot for event `N`. |
| `log-pane.command` | The script that opened the log pane, when one opened. |

What else to know:
- **Owner only:** the folder and its files are readable only by you.
- **Kept out of git:** the evidence root gets a `.gitignore` containing `*`, so runs aren't committed by accident.
- **Masked but not clean:** script values are masked in `run.jsonl`, but screenshots are images, so anything typed or shown stays visible in them.
- **Kept until you delete them:** the bridge never deletes evidence. Remove old runs when you no longer need them.

## Reading a failure

1. Look at the **decisive checkpoint**: the claim with the low probability, and the screen excerpt beside it.
2. Open its **screenshot** (`screen-N`) to see what a person would have seen.
3. For an inconclusive run, the **reason** tells you where it stopped. [Troubleshooting](08-troubleshooting.md) has what to do for each.
4. The **log pane**, or the app log files named in `run.jsonl`'s `prepared` event, show what the app itself said.
