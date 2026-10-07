# Host callback slice verification

**SHIP for offline integration.** All 117 host tests pass with ResourceWarning treated as an error. Native implementation and simulator compilation remain supervisor integration checks. Actual native-encoded ordinary and pending records pass the host parser. This verdict accepts no production native guarantee and no device execution occurred.

| Behavior | Evidence | Verdict |
| --- | --- | --- |
| Delayed startup receives the original absolute deadline | `deadline-red.log`, `deadline-green.log`; deadline stays 190 after preparation begins at 100 with 90 seconds | PASS |
| Missing callback summary cannot permit metadata cleanup | `summary-red.log`, `summary-green.log`; ordinary metadata cleanup stays positive | PASS |
| Point sends cannot exceed declared app queries | `queries-red.log`, `queries-green.log` | PASS |
| Native ordinary/pending encoder output passes real host parsing with explicit harness framing | `native-records.json`, `check-native-records.py`; 18/9 records | PASS |
| Impossible summary arithmetic refuses | `arithmetic-red.log`, `arithmetic-green.log` | PASS |
| Nonzero metadata counts and false reference release refuse | `mode-red.log`, `mode-green.log` | PASS |
| Events without replies, excess retained elements and false send-return claims refuse | `events-red.log`, `events-green.log` | PASS |
| Point-send records disguised as metadata and native-settlement claims refuse | `claims-red.log`, `claims-green.log` | PASS |
| Registered historical metadata reconciliation survives schema evolution without accepting callback-era records | `reconcile-red.log`, `reconcile-green.log`, `reconcile-guard-green.log`; original summary field gets `HISTORICAL_WIRE_DEFECT_MISMATCH` before tool work | PASS |
| Integer and exact Boolean types; pending/late/successful reference replies retain ownership | `all-host.log`, Streams callback tests | PASS |
| Existing source binding, ownership, child process and cleanup behavior | `all-host.log`: 117 tests, no failures/skips, 15.866 seconds | PASS |

Command:

```sh
JEV_NATIVE_OWNER_TSX_LOADER=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/node_modules/tsx/dist/loader.mjs python3 -W error::ResourceWarning -m unittest discover -s spikes/native-owner/host -p 'test_*.py' -v
```

A final extra assertion pins the historical refusal's exact reason; its focused rerun passes in `reconcile-guard-green.log`. No tests were weakened or skipped. The first attempted deadline test command named the wrong test class; it was corrected before recording the meaningful red failure. A later edit-script assertion prevented the settlement-claim change from applying on its first attempt; the behavioral test remained red until the actual source fix applied.

## Shared clock evidence

Both installed SDKs define `CLOCK_MONOTONIC_RAW` as 4; Python uses the same constant. A tiny owned macOS C child returned a raw-clock reading between Python's before/after readings. [Receipt](clock-check.json), [SDK identities](clock-sdk.json).

Apple's [pinned Libc source](https://github.com/apple-oss-distributions/Libc/blob/71bbe350ab79eef58113991d817ccc6165061a64/gen/clock_gettime.c#L107) maps raw monotonic time to `mach_continuous_time` and converts the kernel timebase. Apple describes [Simulator as userspace running on the Mac kernel](https://developer.apple.com/videos/play/wwdc2019/418/). Together, these support the same-host simulator clock domain used by this design. That conclusion is an architectural inference, not a newly executed simulator measurement. Physical devices and cross-host execution remain excluded. [Pinned source receipt](clock-primary-source.json).

The supervisor has since obtained offline runtime owner artifacts. This host change makes no claim that the owner implementation is unobtainable; its terminal and reference contracts remain separate investigation and production acceptance work.

## Native encoder integration

The native worker supplied actual `EncodeNativeRecord` output from macOS tests
using doubles. The ordinary fixture has 18 records with two replies and two
retained elements; the pending fixture has 9 records with one unanswered send.
Both passed the actual `_Stream` validator. These encoder-only files omit the
standalone runner's class-completion marker: validation first confirmed
`CLASS_COMPLETION_MISSING`, then added synthetic harness framing to test the
complete stream. This does not establish native process exit or settlement.
The receipt hashes the exact bytes tested and the script reproduces that check.
