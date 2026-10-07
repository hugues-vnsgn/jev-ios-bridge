# Process accounting after record refusal

The approved Seam is `run_study(plan, configuration, dependencies)`, using
scripted process Adapters, actual temporary files and harmless Python children.
This implements section 1 of `.scratch/native-owner-recovery/spec.md`.

A record or callback refusal now writes `stop-admission` immediately and latches
its first reason. Later bytes remain raw output; they cannot admit another
observation or recreation request. The host observes the already-owned child
and group under the original deadline, without replay, termination or a new
native operation.

Command receipts separate rejected records from process facts:

| Field | Meaning |
| --- | --- |
| `streamRefusal` | First record/callback refusal; never replaced by later expiry |
| `parentReturncode` | Actual integer returned by the owned child's `poll()` |
| `returncode` / state `exited` | Parent exit, absent owned group and closed/drained streams were observed |
| `processObservation.outcome` | `completed` or `pending` process/output accounting |
| `processObservation.reason` | Completion or the separate expiry/output/inspection failure |
| `ownedGroupAbsent`, `streamsClosed` | Observed booleans; `null` means not established |
| `outputEncoding: unconfirmed` | Raw bytes could not be represented as strict UTF-8; no replacement text is invented |

Pending receipts preserve already-observed parent exit and bounded output.
Malformed Adapter booleans or return codes cannot certify completion. Existing
non-stream errors keep their established reason. Limits remain 8 MiB of captured
tool output and 1 MiB of native JSON. File-backed child output is unchanged.

Ordinary metadata cleanup still requires its original valid stream and all
completion/absence gates. A rejected record remains retained even after a zero
child exit; a process receipt never certifies native settlement. No historical
receipt or missing exit code is reconstructed by this change.

The first regression failed against `db1da661a21fd97f6711f1818bac5934a533c82b`:
numeric completion flags and the later class marker arrived in one chunk, but
the study returned at clock 0 instead of supervising to the child's exit at
0.03. The log is `/tmp/jev-native-owner-process-delayed-exit-red.log`.

The final focused suite replayed against that same original implementation
reports 3 assertion failures and 15 errors from missing process facts/receipts
across 10 tests. It also observes the real bad-record child still running when
the old study returns. Test children exit naturally even during the red replay.
The baseline log is `/tmp/jev-native-owner-process-accounting-red.log`.

After the fix:

```sh
python3 -W error::ResourceWarning -m unittest discover \
  -s spikes/native-owner/host -p test_study.py -k Processes -v
python3 -W error::ResourceWarning -m unittest discover \
  -s spikes/native-owner/host -p test_study.py -v
```

The focused 10 tests and full 41 tests pass. Logs are
`/tmp/jev-native-owner-process-accounting-focused-green.log` and
`/tmp/jev-native-owner-process-accounting-full-green.log`. Cases include delayed
zero/nonzero exits, a surviving descendant at expiry, group/stream inspection
uncertainty, output limits and invalid encoding, unchanged non-stream refusal,
same/subsequent-chunk recreation suppression and callback refusal. Existing
valid metadata cleanup and strict stream-boundary regressions also pass.

Three tests use real harmless Python processes: ordinary timeout, an exited
parent with a live descendant, and a bad-record child that naturally exits 65.
The last produces an independent command receipt while the study stays
`retained / RECORD_SCHEMA`. No simulator, `xcodebuild`, native selector, input,
cleanup, terminating signal, secret or reconciliation operation was used.

Also passed: `python3 -m compileall -q spikes/native-owner/host`, CLI `--help`,
and the staged diff whitespace check. These tests establish host policy only;
device exclusion, the separate historical reconciliation and live evidence are
supervisor integration work. All 23 production requirements remain pending.
