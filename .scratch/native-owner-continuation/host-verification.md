# Persistent research ownership verification

Verdict: SHIP for the prospective host policy tested here, pending independent
review. Live continuation and historical ownership adoption remain UNVERIFIED.
No native settlement or production ticket acceptance follows from this change.

The root cause was one temporary claim serving as the only durable admission
record. A retained reference run followed by loss of that claim allowed a new
study. The new persistent claim survives loss of the temporary claim and study
evidence. The existing `DeviceGuard` still owns identity checks, exclusive
creation and uncertainty; host orchestration owns the two-claim ordering.

## Evidence

`host-red.log`: real `run_study` with the existing controlled tool adapter,
first reference retained, then synthetic temporary guard and evidence removed.
A fresh valid metadata build and a fresh valid reference build both admitted
tool calls. The expected zero-call assertions failed on the original host code.

`host-targeted.log`: 17 ownership tests passed after the fix.
`host-green.log`: 123 host tests passed, zero skips, with ResourceWarning treated
as an error. Final command:

```sh
JEV_NATIVE_OWNER_TSX_LOADER=/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/node_modules/tsx/dist/loader.mjs PYTHONDONTWRITEBYTECODE=1 python3 -W error::ResourceWarning -m unittest discover -s spikes/native-owner/host -p 'test_*.py' -v
```

| Scenario | Surface and oracle | Result |
| --- | --- | --- |
| Retained study, temporary claim/evidence lost, fresh successor of either plan | Actual `run_study`; zero tool calls, persistent claim refuses | PASS, meaningful red/green |
| Existing malformed persistent claim | Bytes unchanged, no temporary claim, no tools | PASS |
| Active persistent claim lost or replaced | Stop before second tool call, retain temporary guard | PASS |
| Partial persistent write | Retained uncertainty and receipt, no tools | PASS |
| Metadata completion | Both held during tools, temporary then persistent release | PASS |
| Temporary release fails | Both claims remain | PASS |
| Persistent release fails | Temporary released, persistent remains in result | PASS |
| Temporary claim already busy | Foreign bytes unchanged, fresh persistent claim released, no tools | PASS |
| Historical metadata reconciliation | Existing inspection/apply/uncertainty/concurrency tests | PASS |
| CLI binding refusal | Real CLI with isolated HOME and TMPDIR, no device calls | PASS |

Authored-file `git diff --check` passed. No simulator commands or process signals
were issued by this work. Native schema is unchanged. Configuration appends
`ownership_root`; ownership receipts add `persistentGuard`; retained resources
may add `kind: persistent-device-guard`.

## Test isolation correction

The first full-suite run exposed a missed CLI fixture: it isolated TMPDIR but
not HOME. Two no-device refusal tests briefly created and released claims under
the real persistent root. The fixture now isolates both. A final read-only
inspection of `/Users/hugues_mini/Library/Application Support/jev-ios-bridge/native-owner/claims`
found zero entries. Created directories were preserved; no real historical
claim was installed, adopted, or deleted. The final 123-test run used corrected
isolation. All direct configurations and reconciliation subprocess writers
were audited.

## Changed files

- `spikes/native-owner/host/device_guard.py`: stable macOS root helper.
- `spikes/native-owner/host/study.py`: paired claim lifecycle and receipts.
- `spikes/native-owner/host/test_device_ownership.py`: regression and failures.
- `spikes/native-owner/host/test_study.py`: shared isolated fixture.
- `spikes/native-owner/host/test_reconcile.py`: isolated direct/subprocess fixtures.
- `spikes/native-owner/host/test_study_identity.py`: isolated CLI HOME.
- `spikes/native-owner/README.md`: ownership behavior and limits.
- `host-plan.md`, this report and three log files in this directory.

This is prospective. The historical reference study predates the persistent
claim. Its archived retained result remains authoritative evidence of uncertainty;
missing temporary originals do not authorize live work. A separate reviewed
adoption path is needed. Bridge consumers still consult only their temporary
lease, and manual removal of both stores defeats this exclusion. The change
makes no stronger external-tool or native-owner guarantee.
