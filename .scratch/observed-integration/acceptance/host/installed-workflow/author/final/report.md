# Ticket10 installed workflow report

**Outcome: PASS for the bounded installed-workflow scope. Whole shipping/live acceptance remains Root-owned and UNVERIFIED.**

Candidate: `a319e5bea63415b6ac981c4ce4e8a25679b010c9`. Advanced dependency base: `75d7618167729b9b9a5547eaa468e37eb12b2504`. Original dispatch base: `d0f49f6c12cbaffb4c034217b7e25b96c52c6cb2`. Branch: `feat/observed-installed-workflow`. Working tree is clean after the one focused commit. All eleven pre-dependency implementation hashes remain identical; the twelfth committed file is own-issue metadata. [Final immutable copies and hashes](final-freeze/manifest.json).

## Changed files

- `.github/workflows/check.yml`
- `.scratch/observed-action-rollout/issues/10-docs-packaging.md`
- `docs/guide/08-troubleshooting.md`
- `docs/guide/14-observed-actions.md`
- `docs/guide/README.md`
- `docs/guide/reference/observed-format.md`
- `skills/test-ios/SKILL.md`
- `tests/docs.test.ts`
- `tests/fixtures/observed-packaging/guard.mjs`
- `tests/fixtures/observed-packaging/proof.mjs`
- `tests/observed-docs.test.ts`
- `tests/observed-packaging.test.ts`

Only the assigned files and Root's narrow `tests/docs.test.ts` parser-classification transfer changed. No production source, package/version/lock, existing goldens, root README, release files, other branch or device/store changed in this candidate.

## H09 subcases and exact evidence

[h09-mapping.json](h09-mapping.json) maps every bounded subcase to raw commands and artifacts. Each accepted proof records37 commands, two installations (npm and plugin), seven CLI invalid-input command checks per installation, three MCP gate cases per installation,34 strict safe-text MCP error calls, zero skips and zero forbidden effects. The effect-denying loader traps account admission opening, SDK construction and child/device dispatch during installed startup/schema checks. This proves startup and offline adapter validation; no valid production-store or admitted device action is inferred.

| Gate | Node26.8.1 | Exact24.0.0 |
| --- | --- | --- |
| Original mandatory proof.mjs | PASS exit0,37 commands | PASS exit0,37 commands |
| Final affected docs/packaging/legacy guide scans | PASS34/34,0skip | PASS34/34,0skip |
| Actual default npm run check, child0022 | PASS1482/1482,0skip,exit0 | PASS1482/1482,0skip,exit0 |
| Typecheck/build | Included PASS in actual check | Included PASS in actual check |

No serial full-suite substitute was needed. Exact Node24 uses `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`; npm/check child PATH prepends its bin directory. Key/options/warning-suppression variables were removed without printing values. No SQLite or warning suppression flags were added. Private evidence uses0077 and final test/proof children0022.

Commands executed:

```sh
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS JEV_PACKAGING_EVIDENCE_DIR=/tmp/jev-ticket10-evidence/accepted-node26-proof node tests/fixtures/observed-packaging/proof.mjs
env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS JEV_PACKAGING_EVIDENCE_DIR=/tmp/jev-ticket10-evidence/accepted-node24-proof /Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node tests/fixtures/observed-packaging/proof.mjs
(umask 022; env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS npm run check)
(umask 022; env -u TYPESAFE_API_KEY -u NODE_OPTIONS -u NODE_NO_WARNINGS PATH=/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin:$PATH npm run check)
```

The two affected scans use each runtime with `--import tsx --test tests/docs.test.ts tests/observed-docs.test.ts tests/observed-packaging.test.ts`, under child0022. Raw logs are `final-docs-node{26,24}-child0022.log` and `final-check-node{26,24}-child0022.log`.

## Installation and artifacts

Both proofs build in private isolated source snapshots. Existing checkout dependencies support compilation only. Each runtime starts with a new clean package project and independent new registry cache; normal npm tarball installation installs actual dependencies with `--ignore-scripts --no-audit --no-fund`. The actual installed `.bin` symlink and shebang are asserted. The plugin is copied into another empty project and uses actual `npm ci --ignore-scripts --no-audit --no-fund`; that project's cache is warmed only by its same-runtime preceding tarball installation. There is no dependency copy/symlink substitute for either installed runtime tree.

| Artifact | Node26 SHA256 | Exact24 SHA256 |
| --- | --- | --- |
| npm tarball | `67c39ea5002e68ebe4a4d36cf2db36085e6e98f97c0bbc594bce491584fa67e1` | `dc53307f9129e5417a984676a460fa80c4eb3b6ebb249c2a2972efc1e95a63d0` |
| plugin zip | `3a2bec0bfb2fc1866c141f4db6ad3dfcb67c5536c5d0e4f52b76aa942a832af4` | `2320543798b0ab715b4c6f3d8859e141ede0c5f5a12eb27594882d11a9b7a8d1` |

Compiled/guide/skill source and installed hashes are in each proof's `summary.json`; the npm installed manifests equal their build snapshots. Plugin skill rewrite and marketplace zip digest are independently asserted. Artifact reproducibility across separate builds is not claimed.

## Preserved failures and repairs

- Initial bin-target harness failure: `node26-proof/failure.json` preserves macOS `/tmp` canonicalization mismatch. Only the owned assertion was corrected to compare canonical paths before the eleven-file freeze.
- Genuine product maintenance alias failure: `node26-proof-round2/016.*` and `node24-proof/016.*` preserve exit0/empty stdout; canonical successful help outputs are `maintenance-canonical-node{26,24}.*`. Root's independently accepted source dependency repaired entry detection. Both final original command016 assertions are now green through the alias, with unchanged harness bytes.
- Original Scenario-only docs scanner failed33/34. `initial-doc-scanner-failure.log` and `initial-docs.test.ts` are untouched. Root authorized known declaration/prepare/action classification through actual production parsers; all other selected blocks retain Scenario validation/count >=3. Final34/34 checks pass on both runtimes.
- First full run used incorrect child0077: `final-check-node26.log`, exit1,1477/1482,5fail,0skip. Four permission-fixture failures are that harness environment error; the fifth is the separately documented unchanged boot-poll timing fixture. [Provenance](full-first-provenance.json) preserves source hashes/mask. Corrected child0022 default checks pass both runtimes without changing protected assertions or timing budgets.

## Docs, skills and limits

Guide/file/heading links resolve through existing legacy docs checks and the new observed checks. All three displayed JSON examples use the production migration/preparation/action parsers. All fourteen legacy/observed golden files remain byte identical to the advanced base; [hashes](goldens.json).

Applied writing-for-agents, unslop, project-organization, do-test and use-git-worktree. The supplied linked worktree was reused. Unslop removed one prose dash connector; code/identifiers and contract claims were preserved. Final checker has0strict/0candidate. Measured words: guide757→757, reference1394→1397, skill1401→1401; reference increased by spelling the numeric range in prose.

CI now configures exact24.0.0 alongside24 and26, plus mandatory isolated proof after package checks. Remote CI has not executed here. Full H01–H09, live acceptance and shipping verdict remain Root-owned. No physical/supplied-source live/other-runtime/real-transport/native consumption or release proof is inferred. L04 remains synthetic loss after backend success. No real admission activation, key/.env access, device work, replay, cleanup, merge, push, publish or version bump occurred.

No unresolved source dependency remains for this ticket. Root still owns independent candidate review, final matrix publication and live verdict.

## Final association and raw gate provenance

[association.json](association.json) contains full eleven-file and fourteen-golden before/after mappings, original33/34 guide-classifier correspondence, exact classifier diff and the clean candidate/sole-parent association. [gate-commands.json](gate-commands.json) records each final raw gate's exact command, cwd, runtime, masks, exits/counts and logs. Every proof also has `commands-metadata.json`, adding0022 child provenance without changing its original37 raw command records. [proof-source-correspondence.json](proof-source-correspondence.json) hashes all production source and package/lock bytes against the accepted advanced base and both build snapshots.

The heavy window is released to Root/09. Source, issue metadata and original evidence are frozen for independent review; no further rerun/edit is planned.
