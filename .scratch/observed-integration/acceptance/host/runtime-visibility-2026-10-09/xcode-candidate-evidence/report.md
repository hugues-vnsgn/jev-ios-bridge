# Xcode output and mount plist parser: author host checks

**PASS for bounded host checks.** Both actual default gates pass. Independent reviews and Root's installed/live proof remain pending; this is an author report.

Commit `38aa879c3954c9d7742ef04059cad4d2fc824c87` over `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8` on `fix/xcode-metadata-output`. The committed write set is exactly five files: allocation-config source/tests, installed-plist source/tests, and the narrowly authorized allocation fixture guard. `candidate-source.json` contains their five SHA256 hashes and the complete source manifest. Private evidence stays uncommitted.

## Repair

Only the exact fixed Xcode Info JSON conversion permits a **128 KiB combined stdout/stderr** maximum. Other commands retain 64 KiB; metadata input retains 64 KiB. The process guard and installed proof share the fixed-target cap. Installed proof now checks combined output, matching the existing process capture. Deadlines, argv, environment, cancellation, strict path checks and stable metadata checks retain their existing behavior.

The Root-authorized fixture extension changes only its output-limit guard: 131072 bytes for the exact `/usr/bin/plutil` command and six fixed arguments targeting Xcode Info; 65536 for all others. Original fixture bytes/hash and contract failures are preserved.

`parseReadonlyMountMetadata(xml, expectedMountPoint)` returns the exact MountPoint and literal false Writable/WritableMedia/WritableVolume flags. It accepts only the exact standard Apple declaration/DOCTYPE, loads no DTD, decodes built-in/numeric references, and rejects malformed XML, duplicate decoded keys and required-field coercion. Supported unknown plist values cannot substitute required fields. Limits are **64 KiB input, depth 32 and 8192 element nodes**, including the plist wrapper and keys/values. The parser performs no I/O and remains unwired.

## Regression evidence

| Scenario | Evidence and result |
| --- | --- |
| Observed conversion sizes and required Xcode fields | Base red 0/2 on both runtimes; repaired focused suites pass |
| Xcode combined cap edge and overflow | 131072 accepts; 131073 refuses through installed and production seams |
| Higher options, other paths/commands, smaller caller cap | Refuse; no unauthorized child/create |
| Other installed combined output | 32768 stdout + 32769 stderr: base red 0/3 on both runtimes; repaired green 3/3 |
| Exact fixture command contract | Original guard red 0/1 on both runtimes; repaired suites pass |
| Input cap, abort, malformed JSON, unsafe metadata | Boundary and boundary+1, close-after-abort, identity/write/link/byte changes all pass, including byte changes with identical injected stamps |
| Retained diskutil XML | Embedded 3108-byte fixture and original SHA256 match; exact mount and false flags accepted |
| Malformed/duplicate/header/DTD/entity/type/resource input | Minimal tracer red 18/58 on both runtimes, with 40 unsafe acceptances; strict parser suites pass |
| Unknown values and accepted resource limits | Required fields remain typed; exact byte/depth/node limits accept |

Initial parser red was a missing-module error on both runtimes. A minimal unwired tracer then passed the retained fixture. Negative regressions preceded the strict parser repair. Tracer source, red snapshots and raw command/source associations remain evidence. The intermediate typecheck failure concerned union narrowing in the new parser; an explicit never-returning function corrected it. Assertions were preserved.

## Final checks

| Check | Node 26.8.1 | Exact Node 24.0.0 |
| --- | --- | --- |
| Frozen affected suites | 174/174, zero skips, exit 0 | 174/174, zero skips, exit 0 |
| Typecheck and build | Exit 0 | Exit 0 |
| Actual default npm run check | 1819/1819, zero skips, exit 0; typecheck/build complete | 1819/1819, zero skips, exit 0; typecheck/build complete |
| Owned coverage | 174/174, exit 0 | Not requested |

Each default used the verified selected Node executable followed by `/opt/homebrew/bin/npm run check`, serially in Root's sole heavy window. No command/flag/assertion/timeout change, added trace environment, Source edit or automatic retry occurred after freeze. Parent/evidence umask 077 and child umask 022 are recorded. Wrappers remove credentials and Node overrides; existing worker-specific warning behavior remains unchanged.

Coverage: allocation-config has 97.52% lines, 90.95% branches and 76.74% functions; installed-plist has 100% lines, 97.30% branches and 100% functions. Allocation-config uncovered lines `55` and `189-193` are existing syntax. No changed line is uncovered. Raw coverage is in `owned-coverage-node26/stdout.txt`.

## Freeze and limitations

Baseline accepted 437 files match the frozen a0e overlay. The final 439-file manifest contains 434 protected existing paths, three owned existing files and two new files. All 434 protected hashes match. Both full receipts preserve identical 439-file before/after hashes. All 69 compiled JavaScript files match across both focused and both full builds; 67 protected compiled files also match the immutable permission baseline.

Locked npm ci succeeded using distinct empty private config files and ignore-scripts. Package/lock bytes remain unchanged. Report/raw/receipt files are mode 600 and directories mode 700; tool-managed dependency cache remains beneath a private 700 root.

The retained native receipt reports stable 34501-byte binary input and complete 77555-byte JSON output. Its three required fields match retained JSON. Persistent tests use injected synthetic input/output of those sizes; no native conversion was rerun. The original-output hash belongs to the child receipt, separate from the larger sanitized pretty JSON representation. The retained XML fixture has its complete original-output hash.

Root owns integration/docs, nonauthor Spec/Standards reviews and installed/live proof. Original permission checkout remains immutable. This task adds no Cryptex discovery, namespace trust, diskutil command, SDK/backend/device operation, production storage operation, secret read, merge, push or publication.
