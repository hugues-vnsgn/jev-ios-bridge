# Source and evidence appendix

Read-only commands: exact git diff 08a985805cb442a2404eb9561ae92f69748ae5e0...d0c24bbbef7961a9377d6338fcff140e7373244e, git show/rev-parse, Python byte/SHA256/JSON audits. No test execution. Final manifest SHA25659a5b4e0a8036d5cd5f8829d51063efc372d4823e39857743e3bf21596224310. Report/root metadata copied separately; immutable source/ copies checked before/after. Original report: ../spec-review-ticket09-final-08a9858/review.md, unchanged.

Independent records: independent-raw-audit.json (30765regular/25symlinks,76completecallsequences+8earlyattempttraces), selected-raw/ (all84 traces and owner exit receipts), independent-gate-read.json and gate-logs/ (five exact command/raw logs), preservation-audit.json (prior closures/source hashes/396IDs), before-hashes.json and after-hashes.json. No current source modification.

Prior closure integrity: host-fault, owner, harness, allocator-public byte-identical to08; MCP concurrency and wait-cancellation blocks unchanged. Only issue/case-matrix reporting metadata differs from gate-time hashes; all8runtime paths match every gate before/after. Raw sequence completeness does not imply native settlement; already-issued calls may still act.

Missing historical raw evidence remains lost and explicitly documented in copied round2-evidence-loss.json. Newly verified durable raws are new executions, not replacements claiming original provenance. Both failed Node26 logs and exact assertion excerpts remain available; no build success is asserted for them. Root's controlled latency diagnosis is separately owned and was not rerun here.

| Path | SHA256 | Git blob |
| --- | --- | --- |
| .scratch/observed-action-rollout/issues/09-host-fault-suite.md | 482d9c6dfffd09237ec004b9a01a0b4e0bede9d495d1d24a84cebdd1c8b3bbf0 | 5673e3854409e35576f1e3f80aec70310c70b8bb |
| tests/fixtures/observed-host/allocator-public.ts | 4362eb422c0213918d9e37e0d43c04644ae9429322be39bed82b0ce98d1228e1 | b32bc9595b88419d658f739124b6305461af1dbb |
| tests/fixtures/observed-host/case-matrix.json | 4a8d1f8b0cc818c55b087cfaac5d54efe5c5da6f1bce22e41df7b229f0d810f7 | 0e0c1529136791bc155769dbdfb735ef71412e56 |
| tests/fixtures/observed-host/early-cli.ts | 9625fc2f76374c41fdb9681fe5fa7c79afa35c1020b0cee98a3be4cd355e67f8 | 4a669d3c2ca8dcd8e3d015a32cbf4cf91b7cda1e |
| tests/fixtures/observed-host/harness.ts | 463d7f5feb7eedc32ac5d688d2bcb57c87460875fd14b7de3f5864da29f893a1 | 38d67168574a97e625a5c261ab84f8eb049a1716 |
| tests/fixtures/observed-host/owner.ts | b9a379c00645a1c3cc0704ad2986572b0c62ef0bbd3586d659649ecf160f941a | 5b7a4eaffbf6043bb127fdc9c2d5accfeafdf00a |
| tests/observed-crash.test.ts | 3a5422f3f63baa67dd28c5cca50ccb23d2ddc9605ea22bd12693fc6b32b5c0ea | 72a73caf582138c16790527f29eeeef9fb6c912b |
| tests/observed-host-fault.test.ts | e7ca2c244ad2f4eff64d9314b05cf8fc6f1fe5def61c64c31b6381cc315d2a9a | 84a7f2042bf09c3d26784088c99c63ced623a507 |
| tests/observed-public-races.test.ts | 9e2187cb3ac5026827d7b9eb1130805a79ed3ba8dcf7ebce81157c12c656954e | 2545b75e66f01a20f5b346ab1fc1889ad27916fb |
| tests/fixtures/observed-cli-server.ts | e0bffe3dfe1b0ee90aed64b7fd2493ddb91faf73cf8c1c9e418338fc55f811d1 | dc304edae1135c8f5971f383d0e7cf3b6d5b7d57 |
