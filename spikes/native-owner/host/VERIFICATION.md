# Host verification, 2026-10-07

Passed at the public `run_study` Interface:

```sh
python3 -W error::ResourceWarning -m unittest discover \
  -s spikes/native-owner/host -p 'test_*.py' -v
```

Observed final output: `Ran 27 tests in 5.400s`, `OK`, exit 0. Subcases cover
inventory identity/state, exact app absence, product/source provenance, fresh
evidence, one admission allowance, pre-spawn ownership, complete schema/sequence,
malformed or contradictory records, 1,024 UTF-8 bytes and 1 MiB boundaries,
32 parent edges, class completion order, runner PID uncertainty, fixture
readiness, activation/recreation distinction, one owned hook write, environment
filtering, metadata cleanup and reference-study retention.

Two tests start actual harmless Python processes: one stays alive past the
allowance; one exits while its owned grandchild remains alive. Both return
retained ownership with no replay or terminating signal. Test processes then
exit naturally. This proves host ownership policy only.

Meaningful red observations preceded their fixes:

| Regression | Observed red | Fix and final result |
| --- | --- | --- |
| Wrong device | `completed != refused` | Refuse before tools/evidence; green |
| Metadata lifecycle | `placeholder != METADATA_COMPLETED` | Full owned study and guarded cleanup; green |
| Documents created at launch | `FIXTURE_DOCUMENTS_UNCONFIRMED != NATIVE_SETTLEMENT_UNCONFIRMED` | Launch before readiness wait; green |
| Exited parent/live descendant | `completed != retained` | Fresh owned process group and output accounting; green |
| Measured canonical three-line ENOENT | `refused != completed` | Exact independent stderr oracle, including U+2019; green |
| Actual Objective-C fixture | `refused != completed` | Accept fixture source in its own directory without a Swift requirement; green |
| Class completion before finished | `completed != retained` | Require final record before class completion; green |

Also passed: `python3 -m compileall -q spikes/native-owner/host`, CLI `--help`,
and `git diff --cached --check`. A test-only expectation initially failed on
macOS `/var` versus canonical `/private/var`; paths now compare their actual
resolved locations without changing the implementation's guard.

No simulator, real `xcodebuild`, native selector, app input, installed dependency
edit or paid model call was run by the host implementer. Native build/test and
live cross-slice execution are separate evidence. Reference studies retain
resources regardless of local method completion: neither process groups nor
runner absence provide a native accessibility fence or contact certificate.
