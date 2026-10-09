# Standards — PASS for the bounded delta

Base: `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8`.
Candidate: `38aa879c3954c9d7742ef04059cad4d2fc824c87`.
Diff: `git diff a0e68917dca1816a6ca98315c2fc932a6fd2f2e8...38aa879c3954c9d7742ef04059cad4d2fc824c87`.

## Documented standards

**0 breaches.** Reviewed AGENTS.md, domain/glossary guidance, ADR-0002/0005/0008/0009, the integration plan, approved Cryptex proposal and scoped ownership.

- `allocation-config.ts:82,100–102,152–163`: one private helper centralizes the fixed Xcode output exception. Input, other-command limits, trust, stable metadata, cancellation and actual-close behavior remain local to their existing interfaces. No frozen public surface or new device capability changes (ADR-0002/0005/0009).
- `installed-plist.ts:1–96`: a deep pure module hides bounded XML traversal behind one typed parsing interface. It validates required fields without coercion, keeps unknown values internal, loads no DTD and performs no I/O. The generic refusal is explicit and consistent; wiring remains separately owned.
- `observed-allocation-backend.ts:65–69` and both changed test files: the fixture extension is confined to the exact authorized command. Tests cross the production/parser interfaces with isolated injected fixtures; existing assertions remain intact, following the implementation plan’s isolation and ownership rules.

## Heuristic judgments

**0 material findings.** Parser mechanics remain private rather than spreading across callers. Its supported unknown values are required by the oracle; no speculative interface is introduced. Repeated test matrices express distinct refusal surfaces and do not warrant extraction.

## Source SHA-256

| File | Hash |
| --- | --- |
| src/observed/allocation-config.ts | `82140b7f019e6031597b678669d8f491d414a0eaf43e403cf49fde68fd370026` |
| src/observed/installed-plist.ts | `c74ddcafaef4e244bd1183695cade8fe4858f609bc6f20a1b86727801bc8b896` |
| tests/fixtures/observed-allocation-backend.ts | `5b8c6b14a463ee8ec312ac33655f18c0efc931c2c900784840342f7aeb0e3d80` |
| tests/installed-plist.test.ts | `c383636a717b8220905f3814d9123ce9ee78cbb1b5dfeb0d82bdf8e80a1aa02c` |
| tests/observed-allocation-config.test.ts | `1ae9db02cb08814a874d9b94ea872105ec2a88fe75d56e0f7263116698dbc4ad` |

## Evidence and limits

Read both frozen 174/174 focused logs, genuine red/fixture evidence and actual 1819/1819 default logs; typecheck/build complete, zero skips/cancellations/TODOs. Verified receipt hashes, all 439 source files, 434 protected base matches, 69 identical compiled files across four builds and 67 protected compiled base matches.

The 77,555-byte Xcode output is a receipt claim; retained JSON is sanitized/reformatted. Size-matched tests are synthetic. No new tests/builds/probes or candidate edits were performed. This independent nonauthor review establishes no installed-host, live or ticket12 acceptance.

Standards: **0 documented breaches; 0 material heuristic findings.**
