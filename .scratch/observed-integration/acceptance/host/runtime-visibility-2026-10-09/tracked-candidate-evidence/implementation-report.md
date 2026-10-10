# Tracked allocation identity correction

Candidate `cc5d30e2fdaf065bec476a65df465dabb1569f2c`; parent `dcc06dc0939d73d860cae9e03d4f1f47bacbd279`. Owned4, protected439, Source443, compiled69. Actual new delta3: allocation-config.ts, allocation.ts, legacy runtime tests. Fixture is byte-identical to parent; original241 cases/assertions remain exact.

The real allocator now composes command tracking through trackAllocationSourceProcess. Registered factory expectations stay in the private invoker registry and flow through the tracking thunk per invocation; the callback sees only operation and thunk. Public SourceProcess remains three arguments, injected callbacks receive exactly three arguments, and production branding propagates through nested adapters. Existing deferred abort, tracking and diagnostics behavior is preserved at the allocator call site. No host trust policy is expanded.

## Regression evidence

Pure path isolation14/14 passed on each exact Node before fixture execution. Neutral extraction (real allocator wired, context not forwarded) yielded6 genuine conversion-restoration failures plus6 already-passing bootstrap invariants on each Node. All6 failures accepted observed changed mount identity and restored it before final validation. The repaired shared helper rejects all12 windows with zero target metadata conversions. The full paired diagnostics are in restoration-matrix.json; do not describe all12 cases as genuine reds.

Six additional semantics cases cover injected success/failure diagnostics and exact argument arity, deferred cancellation with no dispatch, nested production brand and fake allocator authority rejection, and concurrent same-factory calls with different captured identities in each namespace. The concurrent second lookup accepts its own fresh identity while the paused stale first lookup refuses; every tracking callback settles through diagnostics. These tests cross the exact shared helper used by allocation.ts. They do not claim complete production Allocator/native execution.

Both Nodes: owned259/259, focused764/764, coverage613/613, typecheck/build0; actual unmodified official npm run check2258/2258, zero fail/cancel/skip/todo and final build0. Defaults ran serially on frozen Source/compiled vectors with fresh HOST_EVIDENCE_DIR, recorded natural close, no added timeouts, concurrency flags, signals or automatic retries.

## Retained qualifications

The first repaired Node26 owned run passed258/259 and failed only the new brand-test assertion: it checked CONFIG_INVALID against Error.message instead of the existing code property. The new assertion was corrected to code equality, unused copied trace calculations removed, and final gates bind the resulting bytes. That original failed receipt and Source are retained under green-node26. Existing241 cases were not weakened.

The original4fa Node24 default failure's lower cause remains UNRESOLVED; later green runs do not explain it. All prior author/review checkouts remain frozen. No dependencies installed or modified, no key/environment file loaded, and no native/device/account/migration/app-build/SDK or candidate installed/startup operation was performed. Independent reviews, candidate clean37/wrapped startup, integration and later operational/live gates remain pending.

Context SHA256: 7de42479f3263694ed81fe17d43540d638d7d6259531508c28bfd4388fb8e7c9. Verification index SHA256: f355a1134c719bc0cff3a7817d224af9a2cbcb56dc1e01b0d25f7eb6e6d2a9e4.
