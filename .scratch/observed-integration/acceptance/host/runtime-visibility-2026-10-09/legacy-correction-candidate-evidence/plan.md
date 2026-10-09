# Legacy review correction execution plan

Root dispatch SHA: `1567f38156c19edf5714126f96c497bc4c544905527779b18cf7b28805f90e79`.
Corrective checkout: `fix-installed-legacy-binding`, initial4fa9cc99. Original
`fix-installed-cryptex-runtime` remains frozen and is never modified by this author.

## Oracle and seams

The approved policy v3 clause27 and sealed Spec P1 require each later mounted
proof/read to bind the initially enumerated mount identity. Clause23 and Spec P2
require shared cancellation checks after awaited file operations. Public seams:
`verifyInstalledCompatibility`, its injected SourceProcess, and the actual
`allocationSourceProcess` factory with the existing fake filesystem/launch seams.
No private implementation method is exported or called by a regression.

Only three product files are owned: allocation-config.ts, the legacy test suite,
and its fixture. Original199 cases/assertions and other440 Source paths remain.

## Matrix

| Finding | Variants | Expected behavior | Genuine red |
|---|---|---|---|
| P1 later candidate restoration | Both mount classes; all3 leaves; injected caller | Refuse the actually observed101→202→101 change before metadata conversion |6 |
| P1 production inner conversion | Both classes; all3 leaves; stable outer snapshots | Propagate captured mount/file snapshots into private production invocation; no conversion child |6 |
| P1 internal diskutil bootstrap | Both classes; all3 leaves; change only in inner bootstrap | The closed-over recursive invocation compares captured identity too |6 |
| P2 awaited open and EOF read | Both classes; all3 leaves; caller and production inner read | Reject; one close only; no later stat/read/proof/conversion/launch |24 |
| Isolation | Existing pure legacy/public mapping cases | Root/private/Library paths map to the fake root; unknown paths refuse |14 existing |
| Preserved behavior | Original199 legacy cases, Cryptex, allocation config, plist, allocator, artifact suites | Preserve trust, budgets, explicit identifiers, errors and public calls | Combined focused746 |

Both exact Nodes first passed pure14 mapping cases and then recorded0/42 pass,
42 expected failures against original production Source. The18 binding traces
actually observed202, restored101 and incorrectly accepted; the24 abort traces
dispatched a later opened-stat. Valid positive lookups preceded each injection.
The original raw receipts and contemporaneous three-file bytes are retained.

## Private implementation

An internal WeakMap associates each public production factory with its context
invoker. Each call carries an explicit mount snapshot and, during conversion, the
caller's relevant full file-path snapshot. The counted caller uses the registered
invoker; an unregistered injected SourceProcess receives exactly its original
three arguments. The public factory similarly forwards only its three arguments.
There is no mutable current context, global anchor or cached read-only proof.

Mounted snapshots reject a captured mismatch as each component is observed.
Fresh diskutil proofs still run. Their bootstrap receives the same mount anchor,
including closed-over production recursion. The caller's complete pre-read file
snapshot accompanies the inner conversion. Existing lossless identity, input,
output, namespace, process and deadline predicates remain.

The shared byte reader checks abort inside try/finally after open, after stat and
every read including EOF; the final byte confirmation also rechecks abort after
cleanup. Only handle close can follow cancellation. The fixture adds observation
and awaited-result hooks while preserving existing guards and assertions.

## Gate order and retained limits

Original red/green, intermediate typechecks and first Node26 focused746 receipts
remain immutable. A static interface hygiene correction restricted unregistered
fallbacks to three arguments; Root explicitly acknowledged it. Final both-Node
regression/focused/coverage/typecheck/build receipts bind the successor bytes.

Then freeze exactly443 Source/440 protected/69 compiled and the three-path commit.
Notify Root before the already authorized serial full official defaults. Use
HOST_EVIDENCE_DIR, fixed minimal environment, natural close, unchanged npm check,
and no Source change, signal, extra flag or retry. Any unexpected gate failure
is preserved and reported before further work.

Candidate clean37 and wrapped startup remain preparation only until Root's later
exact-context grant and independent reviews PASS. Their recorder preserves the
original prepared bytes and a successor differing only in fixed author CWD.
No native metadata/account/device/SDK/key/network work is performed here. The
original4fa Node24 failed default and unresolved lower cause remain qualified;
new greens cannot reconstruct its missing fault traces or establish native readiness.
