# Ticket08 handoff — PASS (bounded implementation)

Candidate: `a38e7a039c680fce5acb4181e763613958feb742`.
Base/parent: `1275f93c616c90aba63e92468679cf39f13157b5`.
Branch/worktree: `feat/observed-public-adapters`, `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-public-adapters`.

One focused commit,14 owned files,2055 insertions/24 deletions. Source stopped. `commit-receipt.json` verifies all13 source/test/golden blobs and SHA256 against `final-source.json` plus immutable `final-source/` copies after checks and commit. Own issue is metadata only. No private acceptance evidence committed; tracked source clean. Both independent axes PASS on the frozen mapping; Root is associating their reports with this exact commit.

## Changed files and behavior

- `src/cli.ts`: additive seven commands, shared internal typed runCli bootstrap, lazy real composition, safe argument errors, precise outcome/signal exits, concurrent owned shutdown, resolved direct-entry guard supporting npm symlinks while imports remain inert.
- `src/mcp/index.ts`, `src/mcp/observed.ts`, `src/observed/cli.ts`: optional additive MCP composition preserving legacy fixture outputs; one memoized shared accepted service/allocator; strict raw schemas/original UTF-8 bounds, two text blocks and correct isError, conditional new-binding configuration validation, full authoritative projections and one-record CLI rendering.
- `tests/observed-cli.test.ts`, `tests/observed-mcp.test.ts`, `tests/observed-contract.test.ts`, `tests/fixtures/observed-cli-server.ts`, `tests/fixtures/observed-mcp-server.ts`: public subprocess/stdio and shared-service cases; explicit isolated Admission.forTesting, fake runner AND opener/source; genuine bootstrap used by actual entry and fixtures, no lifecycle mirror or unconditional fixture exit.
- NEW `tests/golden/observed-mcp-v1.json`, `tests/golden/observed-replies-v1.json`: seven exact schemas and18 reply/exit projections including historical readOnly/historicalOutcome and busy-state guidance. No existing golden changed.
- `tests/mcp.test.ts`: only two granted actual-CLI whole-list assertions plus deterministic off flag, preserving all three legacy names/schema/replies.
- `tests/contract.test.ts`: only granted named capture-refusal test; recognizes the complete exact two-line Node SQLite notice and retains original anchored reason/exit/stdout/key assertions. Unknown/incomplete/other notices stay unfiltered.
- `.scratch/observed-action-rollout/issues/08-public-adapters.md`: Execution/Claimed by/Comments; triage Status remains ready-for-agent.

Exact gate `JEV_EXPERIMENTAL_OBSERVED === '1'`; off mode retains reads/cancel/retire. No public store-root/fake override, hidden environment gate, admission initialization/migration, implicit recovery, device cleanup, SQL, or borrowed Admission close. Jev judge factories remain lazy. Production observed input policy uses accepted observedDriverFactory; it cannot reuse/fallback to action capture.

## Final checks (same frozen13 mapping)

Runtimes: Node26.8.1 and exact24.0.0 at `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`. Parent evidence umask077; test children0022. All gates sequential. No skips.

Affected suites: `tests/observed-cli.test.ts tests/observed-mcp.test.ts tests/observed-contract.test.ts tests/mcp.test.ts tests/contract.test.ts`.

| Exact invocation / source association | Result | Raw receipt |
|---|---|---|
| `node --import tsx --test --test-concurrency=1` + affected suites | exit0,63/63,0skips | `final-focused-node26.log` |
| Exact Node24 executable, same arguments/suites | exit0,63/63,0skips | `final-focused-node24.log` |
| `npm run check` | exit0; typecheck,1470/1470,0skips,build | `final-full-check.log` |
| `node packed-entry-local-check.mjs` (path in this directory) | exit0; exact compiled-byte tarball, npm local-folder .bin, Node26 shebang/exact24 version/help/seven commands/off action JSON exit3/MCP five vs seven tools | `final-packed-local-entry.log`, `packed-entry-local-result.json` |

Coverage command:

`NODE_V8_COVERAGE=.scratch/observed-integration/acceptance/host/public-adapters/round2/final-coverage node --import tsx --experimental-test-coverage --test-coverage-include='**/src/observed/cli.ts' --test-coverage-include='**/src/mcp/observed.ts' --test-coverage-include='**/src/mcp/index.ts' --test-coverage-include='**/src/cli.ts' --test --test-concurrency=1 tests/observed-cli.test.ts tests/observed-mcp.test.ts tests/observed-contract.test.ts tests/mcp.test.ts tests/contract.test.ts tests/mcp-handback.test.ts tests/android-cli-signal.test.ts tests/android-capture.test.ts tests/scripted-run.test.ts tests/logpane.test.ts`

Exit0,160/160,0skips; raw `final-coverage-node26.log` and `final-coverage/`. Changed-file aggregate94.16%lines/83.42%branches. Observed MCP100/100; observed CLI86.83/93.07; MCP index98.73/87.50; CLI96.27/57.14 including legacy branches. `coverage-audit-notes.md` records the uncovered source/function audit and its limits. Configuration authority, single input/no relaunch, local cancellation/finalization, pure read waits and signal exits have explicit matrix cases, not percentage-only assertions.

`final-hash-check.json` and later `commit-receipt.json` confirm all13 frozen bytes; unchanged original overlap repro SHA256 remains `790f0d2356e711f656ba964490ebb3f1e1f81ad8d99ace8751906eaf9a4426ad`.

## Genuine repairs and preserved provenance

Root original Spec round1 was BLOCKED by two P2 findings; Standards PASS with a nonblocking repeated-classification advisory. Both named repairs stayed within authorized adapters:

1. After failed config validation, a fresh view no longer eligible for the same ready/unbound action/allocation/app delegates to shared action authority. Real durable retirement returns ALLOCATION_NOT_READY, no binding or further backend call; still eligible gives safe config error, unreadable gives unknown STORE_UNAVAILABLE.
2. SIGINT/SIGTERM await bounded runtime close and exit130/143 despite a pending fake active interval. The single readable-transport response is flushed within the existing signal budget; ordinary parked transfers retain natural exit. No cleanup or extra finalization budget.

Owned original product red01:0/3. Corrected final SAME test oracle against immutable round1 source is genuinely red3/3 in06, with exact source/test hashes in05-final-oracle-original-source.json; repaired regression cases plus affected boundaries pass12/12 on both versions (04/07).02's extra response-field assertion failed because WAIT_CANCELLED is a valid operation-error projection; its original test/source are preserved separately. The final oracle keeps full JSON, exact bound/exit, fresh durable cancellation/quarantine and zero-input assertions.05 was an oracle-copy setup failure missing the existing synthetic Fixture.app, retained separately;06 supplies that fixture artifact only. No assertion/budget weakening.

Root reran the unchanged independent retirement and active-resource signal probes:2/2 each runtime,0skips; SIGTERM truly exited143 in81ms/92ms with complete JSON. Original independent files remain unchanged and copied under `../round1-preserved/independent-spec/`.

Original twelve-file manifest/copies/gates and report remain untouched; preserved copies under `../round1-preserved/`; Root separately archived all409 original artifacts with every member SHA256 verified. Earlier adapter scaffold/root-shadow/import/setup diagnostics and intentional additive legacy list evolution remain distinguished from product reds. Original protected evidence overlap reproduction and green rerun after accepted dependency repair are preserved; no protected evidence/service/allocator workaround was made.

## Limits and downstream work

PASS establishes the bounded ticket08 adapter subset. H01–H09 as whole gates and live acceptance remain UNVERIFIED and Root-owned. No production store/backend/device, migration, key/.env, SDK network or native app operation was performed. Real production opening/construction and unreadable-stdout deadline fallback were not executed here; pure constructors/startup and the same configuration helper/classes are exercised at explicit fake seams. Simplify unavailable, not run; independent maintainability review supplies the separate Standards axis.

Original clean tarball offline install failed ENOTCACHED SDK metadata (`../final-packed-entry.log`). Local-folder npm-bin proof uses exact packed bytes with existing local dependencies; it is PARTIAL packaging evidence, not clean-install/H09 PASS. Ticket10 owns clean install. Ticket09 owns broader host faults. No unresolved source/interface ownership blocker after the two named repairs. No merge, push, publish/release or branch advancement performed. Heavy window released; source/test/golden/evidence now frozen for Root archival and exact commit associations.
