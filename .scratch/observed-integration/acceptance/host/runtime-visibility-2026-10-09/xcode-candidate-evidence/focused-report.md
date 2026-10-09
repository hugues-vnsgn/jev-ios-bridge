# Xcode output and read-only mount metadata: author checks

**UNVERIFIED for complete host proof.** Focused checks pass; full default gates and independent reviews await Root's serialized window. No installed/live acceptance is claimed.

Commit `38aa879c3954c9d7742ef04059cad4d2fc824c87` over `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8` on `fix/xcode-metadata-output`. Exactly five committed files are listed in `final-ledger.json`; only private scratch remains untracked.

## Scope

Only exact fixed Xcode Info conversion permits a128KiB combined output maximum. Every other command retains64KiB, input retains64KiB, and deadlines/argv/environment/stable metadata/strict path checks are preserved. Installed proof now checks combined stdout+stderr, matching the production process guard. Root transferred only the corresponding fixture output guard; its original hash is preserved.

`parseReadonlyMountMetadata(xml, expectedMountPoint)` returns the exact MountPoint and three literal false boolean flags. It accepts the exact Apple declaration/DOCTYPE without loading a DTD; supports bounded plist values and safe built-in/numeric references; rejects malformed XML, duplicate decoded keys and field coercion. Limits are64KiB input, depth32 including plist wrapper,8192 element nodes including wrapper/keys/values. The parser has no I/O and remains unwired. No namespace or new native command is authorized here.

## Matrix and TDD evidence

| Scenario | Expected/observed | Evidence |
| --- | --- | --- |
| Retained Xcode34501-byte input /77555-byte JSON and three fields | Old production guard refuses and installed proof rejects; repair succeeds | `xcode-red-node26/node24`:0/2 each; final suites |
| Exact Xcode cap edge and edge+1 |131072 combined accepts;131073 refuses at both installed and production seams | Final suites |
| Other paths/argv/options and smaller caller cap | No arbitrary target increase or higher option; no unauthorized child/create | Final suites |
| Other installed combined output |32768 stdout +32769 stderr refuses | Baseline red0/3 both nodes; repaired green3/3 |
| Fixture exact-command contract | Only exact Xcode Info may request131072 | Fixture red0/1 both nodes; repaired final suites |
| Input cap, abort, malformed JSON and metadata changes |64KiB accepts,64KiB+1 refuses; abort unsettled until close; identity/write/link/bytes changes refuse | Final suites, including byte mutation with identical injected stamps |
| Retained diskutil XML |3108 bytes, expectedSHA256, exact mount and false flags | Final parser suites |
| Malformed/duplicate/header/DTD/entity/type/resource input | Refuses without I/O | Minimal tracer semantic red18/58 both nodes, including40 unsafe acceptances; strict parser final suites |
| Supported unknown values and accepted boundaries | Cannot substitute required fields; exact64KiB/depth32/nodes8192 accept | Final parser suites |

Initial parser red was a missing-module error on both nodes. A minimal unwired tracer then passed the retained fixture; semantic negative regressions were written before the strict parser repair. Tracer source and all red source/test associations remain private evidence. The intermediate typecheck failure was only union narrowing in the new parser; an explicit never-returning function fixed it. No assertions were relaxed.

## Host checks

| Check | Node26.8.1 | Exact Node24.0.0 |
| --- | --- | --- |
| Frozen affected suites |174/174,0 skips,exit0 |174/174,0 skips,exit0 |
| Typecheck |Exit0 |Exit0 |
| Build |Exit0 |Exit0 |
| Owned coverage |174/174,exit0 |Not requested |
| Actual default npm run check |Pending Root window |Pending Root window |

Node executables were verified directly. Commands, runtime receipts, raw stdout/stderr, counts and source associations are bound in `final-ledger.json`.

Coverage: allocation-config97.52% lines/90.95% branches/76.74% functions; installed-plist100% lines/97.30% branches/100% functions. The allocation uncovered lines55 and189-193 are existing syntax; no changed line is listed. Parser has no uncovered lines.

## Freeze and limits

Baseline accepted437 files match the frozen a0e overlay. The final manifest contains439 paths:434 protected existing files, three owned existing files and two new files. All434 protected hashes match. All69 compiled JavaScript files match across both builds. Package/lock bytes are unchanged. Locked npm ci succeeded with distinct empty private config files and ignore-scripts. Evidence parent umask077 and child022 are recorded; credentials and Node overrides are removed.

The retained actual conversion receipt reports complete77555-byte JSON and stable34501-byte input. Required fields match retained JSON. Persistent tests use injected synthetic input/output of those sizes; no native plutil was rerun. Retained actual diskutil XML is embedded with its original hash. The pure parser does not certify a mount or authorize namespace reads.

Root owns full-gate scheduling, integration/docs, independent Spec/Standards review and installed/live proof. Original permission checkout remains immutable. Scratch is uncommitted. No Cryptex discovery, diskutil command, SDK/backend/device operation, production storage operation, secret read, merge, push or publication occurred.
