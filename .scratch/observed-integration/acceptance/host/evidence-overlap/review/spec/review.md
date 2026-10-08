# Spec: PASS — evidence-directory overlap repair

Reviewed base `fd056b5b550d43710c095de105fd3e74c4516e20` against the frozen two-file manifest. No Spec findings or unasked scope. Commit association pending.

`src/observed/evidence.ts:36–40` tolerates only EEXIST from action-directory creation, then applies the existing owner/private-directory/symlink validation and exclusive request-file creation. Public-contract:101 requires “private exclusive evidence” at the shared action directory; allocation-contract:105 requires parked transfer without relaunch. Existing allocation evidence does not justify failing the first action. The fix permits composition while preserving immutable publication and admission as sole outcome authority.

Independently ran the complete bounded evidence test file: **9/9 on Node26.8.1 and exact24.0.0**, zero skips. The composed allocator→service case commits already_satisfied, one observation, false input flags, exactly snapshot-ui+screenshot, no presentation or repeated preparation; stored readiness evidence remains unchanged. Existing file/permissive/symlink directories, unsafe parents and request symlinks/files refuse; projections cannot overwrite earlier evidence.

Additional independent concurrency probe: two prepares against a private directory containing allocation readiness evidence. Exact base source produces two EEXIST failures (genuine red); repaired source permits exactly one request publication and rejects the other EEXIST (green). Readiness bytes and request mode0600 remain intact. Root’s composed pre-fix red log was also inspected: inconclusive instead of already_satisfied.

Both source/test hashes and immutable frozen copies match before/after execution. No large/full-suite run, product edits, production/device operations or live acceptance claim. Broader historical incident remains UNVERIFIED.

## Evidence appendix

`/tmp/jev-evidence-overlap-spec-0r6ptzn_`: manifest.json, before-hashes.json, after-hashes.json.

- evidence.ts SHA256 `deeb65d7c95c84de1c3b559ec2a885da768a8203a2be79af700f3262717462fb`; blob `b444ea949d6b40976f452c29536f8e695a652f90`.
- observed-evidence.test.ts SHA256 `cf1d69ea76361bc77246b782b883cf21e3e2f25b28a5ae64d9c24a1a3b97180e`; blob `95628dfa72033eac1fd2e7a5f51207f63f50de53`.

node26.json/log and node24.json/log: exact commands/runtime/exit0. Command: `<node> --import tsx --test --test-concurrency=1 tests/observed-evidence.test.ts`; exact24 executable `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`. Cwd named repair worktree; childumask0022/evidence0077; TYPESAFE_API_KEY removed.

concurrent.test.ts plus concurrent-red.json/log and concurrent-green.json/log capture the independent same-assertion red/green. before-evidence.ts is exact git-show base source, without editing product files. Initial scratch probe had top-level-await/CJS setup errors; retained as concurrent-setup-* and not counted as behavioral evidence. Corrected probe moved its dynamic import inside the async test and ran unchanged against both sources.
