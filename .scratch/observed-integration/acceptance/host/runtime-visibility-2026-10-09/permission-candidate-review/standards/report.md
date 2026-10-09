# Standards review — PASS for the bounded delta

Base: `4004ece782fc9448607605bfe3a54702f8622bb0`.
Candidate: `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8` (`fix: trust canonical Applications ancestor for installed Xcode`).
Comparison: `git diff 4004ece782fc9448607605bfe3a54702f8622bb0...a0e68917dca1816a6ca98315c2fc932a6fd2f2e8`.

## Documented standards

**0 breaches.** Reviewed AGENTS.md, GLOSSARY.md/CONTEXT.md, docs/agents/domain.md, docs/domain-boundaries.md, ADR-0002/0005/0008/0009, and the integration implementation plan and current owner decision.

- `src/observed/allocation-config.ts:136–151`: the private helper confines the exception to canonical fixed Xcode paths and the root/admin directory with exact `0775` bits. Every descendant and the fresh leaf retain strict trust checks. It adds no device transport, command, configuration override or frozen public-surface change, consistent with ADR-0002/0005/0009.
- `tests/observed-allocation-config.test.ts:230–405`: additions use the existing isolated mapped host fixture and injected child harness. Existing assertions remain intact. Positive and negative matrices exercise both production composition and compatibility lookup; the explicit ancestor-identity limit does not claim atomic path binding. This follows the implementation plan’s host-test isolation and evidence limits.

## Baseline heuristics

**0 material findings.** The permission predicate is local and explained; the test helpers name their purpose and reuse the existing fixture. The matrices’ repeated arrangements express different refusal boundaries. No introduced abstraction or scattering merits a refactor in this delta. These are judgments, not hard standards.

## Evidence and limits

Source SHA-256: `cbf94978d97a8e1b2c9413f83a7fa75decdf9c2f40a325ee77b5c2c895fce69d`.
Test SHA-256: `f92cd1d0e9ddd93e3c8b1dc04de7ffd4f84fd2c9f65f3055858210fd2949fb66`.
Both match committed candidate bytes. Read the frozen focused logs (78/78 each) and final default logs (1723/1723 each); selected receipts/output hashes match the author ledger. Earlier Node26 umask failures and the first Node24 1720/1723 failure remain preserved; the latter cause is unconfirmed.

No tests, builds, native commands, device/store/secret operations or candidate edits were performed. This is an independent nonauthor standards assessment, not integrated installed-host, live L01–L05 or ticket12 acceptance.

Standards: **0 hard breaches; 0 material heuristic findings.**
