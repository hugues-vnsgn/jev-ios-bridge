# Ticket08 round2 Spec: PASS

No remaining findings within the two prior defects and changed repair boundaries. Inspected base/HEAD `1275f93c616c90aba63e92468679cf39f13157b5` plus the frozen thirteen-file round2 manifest; candidate commit association remains pending.

- **Configuration race closed.** `src/observed/cli.ts:69–73` reuses the complete eligibility predicate after configuration failure. A no-longer-ready, bound, absent, imported or mismatched view delegates to shared authority; an unreadable view remains STORE_UNAVAILABLE/unknown. The unchanged real isolated-store probe now returns ALLOCATION_NOT_READY after durable retirement, with identical backend-call lists. The owned regression additionally checks null action digest and unchanged durable state. This meets public-contract:34 and Root's repair scope.
- **Bounded signal exit closed.** `src/cli.ts:111–136` closes owned work, flushes the single response within the remaining signal budget, and exits130/143. The fixture's unconditional post-runCli exit was removed. The unchanged pending-resource SIGTERM probe now exits143 in81ms/92ms on Node26/24, preserving the complete JSON response. Both signal branches share the implementation; author raw regressions exercise SIGINT and SIGTERM. This meets public-contract:93.
- **Narrow legacy transfer respected.** The only `tests/contract.test.ts` diff is inside the named capture-refusal test. Its prefix expression removes only the complete SQLite warning plus exact trace hint; negative examples retain incomplete, other, malformed and prefixed warnings. Existing anchored reason, exit3, empty stdout and key-free checks remain intact. No production suppression or runtime flags added.
- Both observed goldens, other legacy MCP changes and all previously frozen unchanged files remain byte-identical. No scope expansion found.

All13 SHA256/git blobs matched before and after review and their immutable copies. Original round1 probes/results remain unchanged. No production store/backend/device/secret access, heavy gates or live acceptance performed. Final author gates and commit association remain separate.

## Evidence appendix

Independent unchanged probes: `retirement-race.test.ts` and `signal-exit-fixed-setup.test.ts` from `/tmp/jev-public-adapters-spec-v9qit6ha/`. Exact commands, runtime paths and exits in `node26.json` and `node24.json`; raw outputs in corresponding `.log` files. Both are2/2 PASS, zero skips, child umask0022, evidence directory0077. Commands use `node --import tsx --test --test-concurrency=1 <both original absolute probe paths>`; Node26.8.1 and exact24.0.0 verified.

Read author `round2/04-owned-regressions-green.log` and `07-owned-regressions-node24-green.log` (12/12 each), plus both final-focused logs (63/63 each, zero skips). These are owner evidence, not independent suite runs. No inference about unfinished full/coverage/packaging gates.

Exact thirteen-file source SHA256 and Git blob mapping: `manifest.json`, independently audited `before-hashes.json` and `after-hashes.json`. Frozen bytes preserved in private `reviewed-source/`; original probe digests in `unchanged-probes.json`. Read Root repair scope and implementation plan grant85c638db. Base and pending association recorded in `revision.json`.
