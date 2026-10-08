# Standards — PASS with one optional advisory

Frozen base `1275f93c616c90aba63e92468679cf39f13157b5`; all 12 manifest source/test/golden files and immutable copies match before/after review. Commit association pending. Complete reviewed diff, including new untracked files, is preserved.

## Documented breaches

None against AGENTS/domain/tracker/triage, CONTEXT/GLOSSARY, ADR0002/0005/0007/0008/0009, or Root’s explicit ownership transfer. Existing goldens are byte-identical. tests/mcp.test.ts changes only the two authorized actual-CLI whole-list assertions and flag-off setup (implementation-plan:72), preserving all three legacy names/schemas/replies.

The seven transports delegate to the shared runtime/allocator; they add no journal, job ownership, SQL, recovery or device lifecycle. Lazy composition/default fixed Admission and internal explicit fake seams preserve the accepted module boundary. Shared public lifecycle delegation is intentional, so Middle Man is suppressed under the seam decision. runCli imports remain inert; resolved entry paths support the bin symlink. Original-byte request bounds and safe versioned renderers are explicit. Jev judge construction remains deferred until scenario execution.

## Heuristic advisory

**Low, possible Repeated Switches:** src/observed/cli.ts:19 classifies command kind with `command !== 'observed-action' && command !== 'observed-report' && command !== 'observed-cancel'`; src/cli.ts:240 repeats the same policy as `['observed-action', 'observed-report', 'observed-cancel'].includes(command)`. Consider one internal acceptance-kind helper so a future command cannot drift between normal/error rendering. No other new named smell found; tooling-enforced checks excluded.

## Evidence and limits

Read raw 32→33 symlink product red/green; evidence-overlap dependency red/green is separate. 29-provenance.md correctly labels its direct-error acceptance assertion as fixture-only; legacy list evolution/root-shadow/import diagnostics are not behavioral reds. Author focused Node26 is 60/60; original exact24 is 59/60 due existing SQLite warning fixture. Read Root’s accepted PRE08 fe1843 baseline reproducing that unchanged capture failure; it is not an08-introduced Standards finding. Pending full gates are not claimed.

Independent bounded fake-only missing-flag probe returns one INVALID_REQUEST JSON, exit 3, without opening authority. Initial temporary .ts/CJS transform failure is preserved as harness-only. No full/large tests/builds/coverage/install, production stores/backend/device/secrets or source/ticket/acceptance writes. Separate Spec axis remains Root-owned.
