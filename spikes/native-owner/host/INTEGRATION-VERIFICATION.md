# Shared device ownership

The caller regressions cross `run_study` and `reconcile_metadata` using actual
temporary claims and scripted device responses. They establish exclusion policy,
not device or native settlement facts.

The original implementation completed metadata despite an existing unknown-owner
lease. `/tmp/jev-native-owner-device-integration-red.log` records that failure,
plus absent guard ownership during tool calls.

The integrated implementation holds the Bridge-compatible guard before all tool
dispatches and through restoration. It checks ownership before the fixture's
only programmatic recreation write. Reference studies and uncertain work retain
the claim. Settled metadata and read-only reconciliation inspection release only
their matching claims. Pre-native restoration now verifies final inventory before
release; a shutdown return code alone is insufficient.

Eleven caller tests cover busy claims, ownership during commands, metadata cleanup,
reference retention and later exclusion, replacement before uninstall, settled
and uncertain pre-native refusal, inspection release and pending-child retention,
and successful/uncertain recovery apply. All use isolated lease roots.

```sh
python3 -W error::ResourceWarning -m unittest discover \
  -s spikes/native-owner/host -p 'test_*.py' -v
```

All 91 host tests pass in `/tmp/jev-native-owner-recovery-host-green.log`, including
the real TypeScript lease consumer and harmless children that exit naturally.
`npm run check` passes 929 tests, typechecking and the package build; its log is
`/tmp/jev-native-owner-recovery-package-check.log`. Python compile and whitespace
checks pass. Live reconciliation and native study evidence are recorded separately.

Independent Spec review found that archive inventory excluded any file named
`manifest.json`, including unregistered nested files. The Interface regression
in `/tmp/jev-native-owner-recovery-archive-red.log` reached cleanup before the fix.
Inventory now excludes only the root manifest and refuses the extra file before
any device command.

Independent Spec review also exposed false retention after a post-unlink sync
failure. The helper now synchronizes and verifies before unlink, then records
successful removal immediately. Sync failure leaves the claim held; a later
directory-close failure cannot undo observed removal. Two guard regressions
cover this distinction, including the actual Bridge consumer. Claim deletion
durability is not promised; crash reappearance would conservatively keep it busy.

The original metadata failure, lost historical exit code and archive remain
unchanged. These changes accept none of the 23 production capability requirements.

## Callback diagnostic host verification (2026-10-07)

The callback host slice passes 117 host tests with ResourceWarning treated as
an error. The test boundary is `run_study` with scripted process output and real
temporary receipts/files; no device commands execute. Red/green logs and the
clock check are in `.scratch/native-callback-implementation/verification/host/`.

The startup regression proves that host preparation consumes the original
allowance: native receives an absolute deadline of 190 when host admission
started at 100 with 90 seconds, even after preparation advances the fake clock.
`JEV_NATIVE_OWNER_ADMISSION_SECONDS` is no longer produced. Both native and host
use `clock_gettime(CLOCK_MONOTONIC_RAW)` on the same Mac. Installed SDK headers
and Python identify clock 4, and a tiny owned C host process produces a reading
between Python's before/after readings. Apple's Libc implementation maps that
clock to `mach_continuous_time`; Apple's WWDC19 Simulator architecture describes
Simulator userspace running on the Mac kernel. This supports a shared clock for
this same-host simulator design. It is not a live simulator measurement or a
physical-device guarantee.

Finished records require exact callback count/Boolean fields. Tests cover
missing summaries, invalid arithmetic and types, nonzero metadata callback
counts, false reference-release claims, pending/late and ordinary replies.
Every reference study retains ownership. Zero-query metadata still cleans up
only after all its existing process and identity gates pass.

Historical reconciliation remains limited to its registered, source-bound
numeric-flags defect. After validating zero queries and the exact old defect,
it supplies a zero callback summary only in the diagnostic parsing copy. It
rejects an original callback-summary field; original bytes and the invalid
stream verdict remain unchanged. Fresh studies never use this conversion.
