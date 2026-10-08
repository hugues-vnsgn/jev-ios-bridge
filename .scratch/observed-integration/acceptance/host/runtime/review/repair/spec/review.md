# Spec recheck: PASS (bounded repair)

All three findings on original `c751a73df7931107af23619c350d2ca406ac55db` are closed against the frozen repair manifest. No remaining Spec finding or scope expansion in the two-file repair diff.

- **P1 cancellation:** `src/observed/service.ts:225–230` revokes the owned local driver and aborts its controller before the initial authoritative read. The original reproduction now issues only `snapshot-ui`; unavailable storage produces `FINALIZATION_UNCONFIRMED`, no outcome, and no invented durable cancellation flag. This satisfies admission-decision.md:16 (“stops accepting commands synchronously”).
- **P2 finalization deadline:** `service.ts:164–185` uses its separate 5000ms signal and retains explicit cancellation checks after close and provisional evidence. The unchanged probe observes success in 60–64ms, closes at 741–751ms against a 500ms action deadline, and commits `already_satisfied`. Public-contract.md:30 is met. Source and affected regressions confirm failed cancellation writes during prolonged close/provisional cannot publish computed success; the flag becomes durable only through the verified joint finalization transaction.
- **P2 blocker evidence:** `service.ts:92–107` reads and validates the retained creator identity, guard and absolute persisted directory. The original probe returns `/isolated/blocker-evidence`; missing/unreadable/mismatched/relative/nonblocking records return safe `STORE_UNAVAILABLE` without fabricated evidence or consumption, meeting public-contract.md:103 and allocation-contract.md:105.

Read the owner’s affected-final logs: 25/25 on Node26.8.1 and exact24.0.0, zero skips. Independently replayed all three unchanged original probes on both versions: 3/3 each, zero skips, exit0. All15 manifest entries match before/after; only the two authorized blobs differ from original. No full suite rerun or live acceptance claim. Historical real-backend incident remains UNVERIFIED. Final repair commit `a898e80bf3d0d5af7b17618f9fcec56695174289` is now independently associated: all15 committed blobs match the tested mapping; parent is the original candidate.

## Evidence appendix

Directory: `/tmp/jev-runtime-spec-recheck-uzhuu67c`.

Commit audit: `commit-hashes.json`; exact repair range `c751a73df7931107af23619c350d2ca406ac55db...a898e80bf3d0d5af7b17618f9fcec56695174289`, changes service/test and ticket06 Comments only.

- `manifest-copy.json`, `before-hashes.json`, `after-hashes.json`: exact15-file mapping.
- `src/observed/service.ts` SHA256: `0c9e6cd6bfc1d7308bc6dcdb1cbf88b9179143084f9cb66d28af09cb6a9def6d`; git blob `4ba1a61ae47f4ea6f8479cafb08e570b653c45c4`.
- `tests/observed-service.test.ts` SHA256: `b80d5741d34f6cd1a0c350c5c6ddc50295f0483253eef0a111387476567222db`; git blob `ebd5d8f59a82944209858f9672876da13b8b9ad9`.
- Original red evidence remains `/tmp/jev-runtime-spec-review-5rTBCH/{probes.log,host-guard.log}`; originals untouched. `probe-hashes.json` records unchanged probe content.
- Exact command, cwd the runtime worktree, child umask0022 and TYPESAFE_API_KEY removed: `node --import tsx --test /tmp/jev-runtime-spec-review-5rTBCH/probes.test.ts /tmp/jev-runtime-spec-review-5rTBCH/host-guard.test.ts`. Node26.8.1: `node26.json`, `node26.log` (3/3).
- Same command with `/Users/hugues_mini/.npm/_npx/2c6eebc6231f3284/node_modules/node/bin/node`: exact24.0.0, `node24.json`, `node24.log` (3/3). Normal SQLite ExperimentalWarning retained.
- An initial Node26 probe also passed3/3 (`probes-node26.log`), but its shell wrapper failed assigning zsh’s readonly `status`; the recorded successful rerun above supplies reliable exit evidence. No probe assertion was modified.
