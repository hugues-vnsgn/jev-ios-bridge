# Standards — PASS (round 2)

Base `1275f93c616c90aba63e92468679cf39f13157b5`. All 13 manifest SHA256/git blobs match current files and immutable round2 copies; before/after hashes show no drift. Exact commit association remains pending. Original review and artifacts are unchanged.

## Documented breaches

None against the previously reviewed AGENTS/domain/tracker/triage, CONTEXT/GLOSSARY, ADR0002/0005/0007/0008/0009 or Root’s round2 repair transfer. Existing goldens are byte-identical; the MCP test diff still equals its exact authorized patch. The additional contract-test diff is confined to the named capture-refusal test.

`tests/contract.test.ts:520` recognizes only the anchored, complete SQLite banner plus exact trace hint. Incomplete/other/prefixed notices remain untouched; the original exit3, anchored reason, empty stdout and absent-key assertions remain. This is local fixture normalization, not production suppression. The unchanged pre08 baseline warning is not an08 regression.

`src/observed/cli.ts:70` reuses the existing consistent eligibility read after validation failure and delegates the resulting noneligible view to the shared service. No adapter authority or lifecycle is added. `src/cli.ts:112–132` initiates shared close on a signal, awaits bounded finalization, and flushes its single response within the remaining signal budget before explicitly exiting. The fixture no longer forces exit; its pending-resource mode retains a real interval. The owned SIGINT/SIGTERM cases therefore exercise genuine runCli termination rather than conceal it.

## Heuristic advisory

**Low, possible Repeated Switches**, unchanged: `src/observed/cli.ts:19` excludes the three action commands while `src/cli.ts:252` repeats those names for error acceptance-kind classification. An internal classification helper could prevent future policy drift. This remains optional. No new named smell; intentional shared lifecycle delegation is not Middle Man under the accepted seam design. Tooling-enforced checks excluded.

## Evidence and limits

Read preserved final-oracle-on-original source red3/3 and corrected owned green12/12 on Node26/exact24; fixture setup/overassertion failures remain separately labelled. Original symlink product and evidence-overlap dependency histories remain separate. This re-review ran no tests/build/coverage/packing or live operations and changed only private review artifacts. Full acceptance gates and the separate Spec axis are not claimed.
