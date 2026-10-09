# Standards review — frozen original candidate

**Standards: PASS. Implementation acceptance remains FAIL under the separate Spec review (P1/P2).**

Base: `720cb380d07102d72b20a6a4f5f7787a0ab88f2b`  
Candidate: `4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d`

All 11 diff hunks were inspected, including the entire production delta, new fixture and 199 new cases. No documented Standards breach or material Fowler finding was found. Domain vocabulary, stable public surfaces, explicit runtime/budgets and private module boundaries were checked against `docs/agents/domain.md:41`, ADR0005:8, ADR0009:8 and `docs/domain-boundaries.md:9`. Public signatures/defaults and the strict ordinary-path helpers remain unchanged.

The private `MountedIdentity`/`ExactTime` and `MountedEnumeration` types bundle proof data. Shared snapshot, mount-proof, byte-read, conversion and enumeration functions handle both mount classes without duplicating their algorithm (`allocation-config.ts:112–211,334–381`). All twelve requested Fowler heuristics were applied as judgment calls; repository rules took precedence and tooling-enforced matters were omitted. The per-hunk audit records the reasoning.

Exact owned SHA-256 bindings:

| File | SHA-256 |
| --- | --- |
| `src/observed/allocation-config.ts` | `5618f346f9855b54b809f82b1683a396f21a9e568328d0101d23e19c599bd6ce` |
| `tests/observed-legacy-volume-runtime.test.ts` | `981f171779cba5efeb084bd0c84d37589fa1b8a13114d32d1a741c721ff11334` |
| `tests/fixtures/observed-legacy-volume-runtime.ts` | `b0407ffb47f65ac4cfbdfb29c20a78ef94bdba19e1ce70c892bcda721adfc9ab` |

Bounded correspondence: 1,555 checks passed; current/committed443 Source, protected440 and compiled69 match. Twenty-eight retained command/raw receipts were checked, including focused704/coverage553 on both Nodes. Original Node26 passed2198; original Node24 retained2195pass/2fail/1cancel. Its lower cause remains unresolved and missing traces irrecoverable. Later exact Node24 comparison passed baseline1999/candidate2198; this does not explain the earlier failure. Original false build-marker fields and corrected derived proofs remain preserved.

Root’s sealed44-check archive audit is relied on; this reviewer did not repeat its exhaustive traversal or execute gates. Spec P1 metadata binding and P2 post-open/EOF cancellation require correction. Approved v3 final clean37 and wrapped-startup proofs remain pending before integration. No installed/native compatibility, ticket12 or live acceptance is claimed.
