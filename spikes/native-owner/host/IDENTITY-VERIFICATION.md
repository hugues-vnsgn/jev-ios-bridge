# Independently bound study identities

Implementation head: `d85a6ac55556669679552e5978289cc4f2b0162a`, 2026-10-07.
The native runtime and policy-test sources are byte-identical to tested head
`1997e3d281ad5839f33362f56275d0082cf4cb48`. This document adds no runtime input.

The ordinary study now requires its builder receipt before any simulator
command. Metadata and reference work select separate fixed profiles, check
their own canonical absence replies, and require the native identity observation
before later records. Fixture telemetry includes its actual bundle identifier;
both readers check it, and the host rechecks telemetry before recreation.
The historical reconciliation and startup diagnostic keep their original IDs.

## Verification

| Check | Result | Exact local log |
| --- | --- | --- |
| Full host regressions at `d85a6ac` | 104 tests passed | `/private/tmp/jev-native-identities-d85a6ac-host.log` |
| Historical diagnostic caller at `d85a6ac` | 2 tests passed; restoration test has two cases | `/private/tmp/jev-native-identities-d85a6ac-probe.log` |
| Full macOS native policy suite at `1997e3d` | 27 tests passed, natural XCTest exit | `/private/tmp/jev-native-identities-1997e3d-native-policy.log` |
| Builder and host CLI help | Passed | `/private/tmp/jev-native-identities-d85a6ac-builder-help.log`, `/private/tmp/jev-native-identities-d85a6ac-host-help.log` |
| Python compilation and diff whitespace | Passed | Commands below |

```sh
python3 -W error::ResourceWarning -m unittest discover -s spikes/native-owner/host -p 'test_*.py' -v
python3 -W error::ResourceWarning .scratch/native-owner-recovery/startup-probe/test_observe.py -v
xcodebuild test -project spikes/native-owner/native/NativeOwnerStudy.xcodeproj \
  -scheme NativeOwnerPolicyTests -destination 'platform=macOS' \
  -derivedDataPath /private/tmp/jev-native-identities-policy-final
python3 -m compileall -q spikes/native-owner/host spikes/native-owner/native/build.py \
  spikes/native-owner/binding.py .scratch/native-owner-recovery/startup-probe/observe.py
git diff --check
```

The host suite includes the real TypeScript lease consumer and natural-exit
harmless child tests. New tests cross `run_study` or the builder CLI with actual
temporary files and external-command doubles. They cover cross-plan binding,
altered source/template/project/product/plan, extra and missing inventory files,
symlinks, foreign dependencies, runtime identity ordering, fixture identity,
metadata cleanup and reference retention. Fixed literal expectations are
independent of the shared declaration. No worker operated a simulator.

## Failing-before and passing-after evidence

Each prefix below has `-red.log` and `-green.log` receipts in `/private/tmp/`:

| Prefix | Failure observed before implementation |
| --- | --- |
| `jev-native-identities-missing-binding` | A study completed without a builder receipt. |
| `jev-native-identities-profile` | The host refused the selected metadata product as a foreign bundle. |
| `jev-native-identities-runtime` | Missing or wrong runtime identity still authorized metadata cleanup. |
| `jev-native-identities-builder` | Builder CLI did not accept the closed `--plan` selection. |
| `jev-native-identities-nested-input` | An unbound nested fixture source still admitted the study. |
| `jev-native-identities-native-policy` | Missing identity observation and a mismatched runner still acquired the native getter: one test, four assertion failures. |
| `jev-native-identities-recreation-identity` | Changed fixture identity still received a recreation write. |
| `jev-native-identities-nested-resource` | A nested fixture README resource escaped source binding. |

These checks establish local policy and compilation of the macOS policy target.
Generic iOS builds and live metadata/reference execution belong to the
supervisor's next verification step. Original archives and approved-case bytes
were unchanged. The consumed case is not replayed, canonical absence is not
weakened, and no production capability or native settlement is accepted. All
23 production requirements remain pending.
