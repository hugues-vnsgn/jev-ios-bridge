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

All 89 host tests pass in `/tmp/jev-native-owner-recovery-host-green.log`, including
the real TypeScript lease consumer and harmless children that exit naturally.
`npm run check` passes 929 tests, typechecking and the package build; its log is
`/tmp/jev-native-owner-recovery-package-check.log`. Python compile and whitespace
checks pass. Live reconciliation and native study evidence are recorded separately.

Independent Spec review found that archive inventory excluded any file named
`manifest.json`, including unregistered nested files. The Interface regression
in `/tmp/jev-native-owner-recovery-archive-red.log` reached cleanup before the fix.
Inventory now excludes only the root manifest and refuses the extra file before
any device command.

The original metadata failure, lost historical exit code and archive remain
unchanged. These changes accept none of the 23 production capability requirements.
