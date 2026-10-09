# Legacy mounted-runtime review correction

## Frozen candidate

Commit `dcc06dc0939d73d860cae9e03d4f1f47bacbd279` over `4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d` in `fix-installed-legacy-binding`.
Only three declared product paths changed. Git and working Source443 are equal;
all protected440 bytes are unchanged. Both final builds and both official defaults
produce the same 69 compiled bytes. Candidate context SHA:
`0f4dfabdfb9d8059fa6b992c9f35eeca7880f2fb354c12340b78053866ef67fb`.

| Owned path | SHA256 |
|---|---|
| `src/observed/allocation-config.ts` | `735bd7e7b864292a371127d0a4ccecd2ad485ecf456c9081dd5c481b51427cee` |
| `tests/observed-legacy-volume-runtime.test.ts` | `415aa60fa936511bbe33bb4685533cd2c86391dc94057ee23245d8ac1ec3c5cd` |
| `tests/fixtures/observed-legacy-volume-runtime.ts` | `223b33b9b0e79e23a0963804e55f765b266b6592152709588f5dd739621a420f` |

The original `fix-installed-cryptex-runtime` checkout and its4fa evidence stayed
frozen. The original 4fa Standards review PASS does not override its Spec P1/P2 FAIL.
This is the author's implementation/validation report, not an independent verdict.

## Corrected behavior

P1/policy clause 27: each subsequent fresh mounted proof and path read compares the
initially enumerated candidate identity as each component is observed. A private
per-invocation context carries that mount snapshot and the caller's full file-path
snapshot into the registered production conversion invoker. The same context reaches
its closed-over diskutil bootstrap. The public factory and ordinary injected process
keep exactly three arguments; no public trust parameter, mutable current context,
global identity anchor or cached mount proof was introduced. Fresh read-only XML
proofs and all existing lossless identities, bounds and namespace rules remain.

P2/policy clause 23: the shared byte reader checks the signal immediately after
awaited open inside try/finally, after stat, and after every read including EOF.
Final byte confirmation checks again after cleanup. Once the shared signal aborts,
only the acquired handle's close may dispatch. The fixture adds observed identity
and awaited-result hooks; close cleanup does not depend on path presence.

## Genuine regression evidence

Both exact Nodes first passed the 14 existing pure mapping cases. Against original
production Source, both corrective runs recorded 42 tests, 0 pass, 42 genuine failures:
18 restored identity cases and 24 awaited open/EOF cancellation cases. Every
identity case actually observed inode 202, later restored 101, kept the read-only XML
unchanged and was incorrectly accepted. Every abort case dispatched a later
opened-stat. Each injection followed a valid successful compatibility lookup.

The 42 cases cover both legacy and Cryptex namespaces, all three metadata leaves,
caller conversion, production inner conversion and internal diskutil recursion;
abort cases cover both caller and production read layers. Final 42/42 runs on both
Nodes reject the actually observed identity mismatch before metadata conversion
and show exactly one post-abort close with no later Source effect or fake launch.
The matrix retains exact test names, ordinal rows and raw diagnostics per Node.

All original 199 case bodies/assertions are byte-preserved, with only an additive
Cryptex bundle import above them. Original parameter rows and the duplicate display
label qualification are retained. The fixture's pure mapper, identity view, Source
argv/env/output guards and fake launch implementation are byte-preserved. Red
test/fixture/Source archives are contemporaneous, not reconstructed. Intermediate
42/42/typecheck and 746/746 Node26 receipts remain separate: the later exact
three-argument injected-process fallback repair was followed by all final gates.

## Final exact-byte gates

Every listed final gate binds the frozen candidate's exact working bytes; the
predefault gates preceded the commit without any byte change. Each is serial,
retains raw stdout/stderr, command/runtime/environment names, before/after Source
vectors and actual child close. Final coverage is 98.77% lines, 94.55% branches,
89.16% functions in allocation-config.ts (raw reports retained).

| Gate | Passed tests | Exit | Actual close UTC |
|---|---:|---:|---|
| final-green-node26 | 42 | 0 | 2026-10-09T10:33:46.348977+00:00 |
| final-green-node24 | 42 | 0 | 2026-10-09T10:34:18.195921+00:00 |
| final-focused-node26 | 746 | 0 | 2026-10-09T10:36:01.421027+00:00 |
| final-focused-node24 | 746 | 0 | 2026-10-09T10:38:18.746600+00:00 |
| final-coverage-node26 | 595 | 0 | 2026-10-09T10:40:26.445010+00:00 |
| final-coverage-node24 | 595 | 0 | 2026-10-09T10:43:29.772999+00:00 |
| final-typecheck-node26 | — | 0 | 2026-10-09T10:43:43.734248+00:00 |
| final-typecheck-node24 | — | 0 | 2026-10-09T10:43:47.958783+00:00 |
| final-build-node26 | — | 0 | 2026-10-09T10:43:54.987280+00:00 |
| final-build-node24 | — | 0 | 2026-10-09T10:44:00.059940+00:00 |
| Official default Node26 | 2240 | 0 | 2026-10-09T10:52:58.535712+00:00 |
| Official default Node24 | 2240 | 0 | 2026-10-09T10:56:52.246932+00:00 |

The official commands were the unchanged pinned Node plus official npm-cli
`run check`, whose package script is `npm run typecheck && npm test && npm run build`.
No test flags, concurrency/timeout changes, warning suppression, signal or retry
were added. Parent umask 077, ordinary child 022, empty private npm configs and a
minimal environment omitted the key, NODE_OPTIONS and NODE_NO_WARNINGS.
HOST_EVIDENCE_DIR retained the actual public/backend fake-host traces.

The 74-check predefault audit SHA is `3819ca2d668fb7e8162f0df4c9c307d4522524e1e482d25ff75590858e7e105b`.
Final verification index SHA is `bade9078eba361c97910bcb79e3c6c49a2da13f11e8f2d618c0f3a3707f48576`. Exact raw build-line proofs bind
each completed official command to its 69 compiled payload. Full evidence manifests
describe every retained regular file, symlink, original mode and explicit exclusion;
symlink targets are recorded without following them.

## Limits and remaining execution

All these tests use hermetic temporary installed namespaces and fake launch seams.
They prove neither native compatibility nor kernel namespace pinning/device
acceptance. The original 4fa Node24 failed 2198-test default remains preserved;
its lower cause is unresolved. Later green comparisons and these corrected gates
do not establish a repair of that historical timing/fault failure.

Both independent corrected-candidate reviews remain Root's next step. The successor
installed/startup recorder is prepared only (SHA
`d5b7801ee715c2b7aef52a319f28ba828b12f8b050e5ae06f276c93cf35076db`).
Candidate clean37 packaging and wrapped startup execution remain held for later
Root dispatch after both reviews PASS. Root then integrates/revalidates; the sole
native operator stays idle until fresh installed and compatibility gates pass.
