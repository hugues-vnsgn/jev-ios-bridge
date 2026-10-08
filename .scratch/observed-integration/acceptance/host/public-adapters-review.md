# Public adapters — accepted bounded implementation

Candidate `a38e7a039c680fce5acb4181e763613958feb742`, parent `1275f93c616c90aba63e92468679cf39f13157b5`, integrated as `538e5770d1a02b7ef92d2dd69cd3a8a9d692ec4a`. Root independently verified the exact fourteen-path commit: thirteen frozen source/test/golden files plus ticket08 metadata. Both reviewers associated their PASS with that exact candidate. Integration preserves every reviewed blob.

## Review and repair

Round 1 remains BLOCKED with its two P2 findings and original raw failures preserved. The bounded round 2 repair delegates concurrent retirement after configuration failure to shared authority and makes SIGINT/SIGTERM actually exit after bounded finalization, including when a backend resource remains alive. The fixture no longer masks process liveness with an unconditional exit. The one transferred legacy test recognizes only the complete exact Node 24 SQLite warning banner; its original reason, exit, stdout and absent-key assertions remain. Root reproduced that warning on accepted pre08 source, so it is not an adapter regression.

- [Spec round2](public-adapters/review/round2/spec/review.md): PASS. The independent Spec reviewer reran both unchanged original probes, 2/2 on Node 26.8.1 and 2/2 on exact 24.0.0, zero skips. Retirement returns ALLOCATION_NOT_READY with no extra backend calls; the pending-resource SIGTERM child exits 143 in 81ms/92ms with complete JSON. [Exact commit association](public-adapters/review/round2/spec/commit-association.md).
- [Standards round2](public-adapters/review/round2/standards/review.md): PASS, no documented breaches or new smells. The original optional Low repeated-command-classification advisory remains nonblocking. [Exact commit association](public-adapters/review/round2/standards/commit-association.md).

The author's report describes the original independent probes as “Root reran.” Root dispatched and preserved those independent runs; the Spec reviewer executed them. They are distinct from Root's integration checks below.

All thirteen current and immutable source hashes matched before and after both reviews. Existing goldens are unchanged; the two legacy MCP whole-list assertions retain the three legacy tools and add the five accepted disabled-mode observed tools. [Root candidate/path audit](public-adapters/integration/candidate-audit.json).

## Checks and evidence

Author final frozen checks: affected 63/63 on both runtimes; full 1470/1470 plus typecheck/build; selected coverage 160/160 with 94.16% lines/83.42% branches across changed adapters; zero skips. [Author report](public-adapters/author/round2/report.md), [commit mapping](public-adapters/author/round2/commit-receipt.json). Initial product reds, the final unchanged oracle's 3/3 failures on original bytes, and separately labelled fixture/setup failures remain preserved. Round 1's 409 artifacts and round 2's 330 artifacts are losslessly archived with every member verified; noncoverage files are also directly readable. [Round1 preservation](public-adapters/author/round1/README.md), [round2 preservation](public-adapters/author/round2/preservation.json).

Root ran these sequentially in the physical integration checkout at `538e5770d1a02b7ef92d2dd69cd3a8a9d692ec4a`, with explicit fake backends/isolated stores, no key and no extra SQLite flags. Private evidence uses umask0077; test children use0022.

| Integration gate | Result | Raw command / output |
| --- | --- | --- |
| Combined admission, migration, driver, allocator, runtime and public suites; Node 26.8.1 | PASS 725/725, zero skips | [Command](public-adapters/integration/node26.json), [output](public-adapters/integration/node26.log) |
| Same combined suites; exact Node 24.0.0 | PASS 725/725, zero skips | [Command](public-adapters/integration/node24.json), [output](public-adapters/integration/node24.log) |
| npm run check | PASS 1470/1470, zero skips, typecheck/build | [Command](public-adapters/integration/full-check.json), [output](public-adapters/integration/full-check.log) |
| Accepted runtime/allocator plus new adapters, before/after | All 34 source/test/golden hashes and Git blobs match | [Before](public-adapters/integration/source-audit-before.json), [after](public-adapters/integration/source-audit-after.json) |

## Limits and next work

This accepts ticket08's bounded public adapter implementation. H01–H09 as complete acceptance rows remain UNVERIFIED pending tickets09/10 and Root's row-level matrix. The exact packed-byte/local-dependency npm-bin proof passes on both runtimes but remains PARTIAL; the original offline clean install failed ENOTCACHED. Ticket10 must supply a genuine clean installation. Real store activation, device operations, SDK network, remote CI, live acceptance and native/transport release are not established by these checks.

Continue09 host faults and10 installed documentation/packaging in parallel with disjoint ownership and serialized heavy gates. Live remains gated by all host rows, operational migration declaration, unchanged artifacts and the owner's explicit iOS27.0 prerequisite. No merge, push, release or publish is authorized.
