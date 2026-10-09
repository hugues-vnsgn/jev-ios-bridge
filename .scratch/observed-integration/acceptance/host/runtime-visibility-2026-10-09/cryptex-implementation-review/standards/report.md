# Standards — PASS for the static delta

Base: `38aa879c3954c9d7742ef04059cad4d2fc824c87`.
Candidate: `dadde33a36440db6d9414adf84f80916caa9d2b3`.
Diff: `git diff 38aa879c3954c9d7742ef04059cad4d2fc824c87...dadde33a36440db6d9414adf84f80916caa9d2b3`.

## Documented standards

**0 breaches in the changed hunks.** Reviewed AGENTS.md, tracker/domain guidance, glossary, ADR-0002/0005/0008/0009, implementation ownership and the frozen approved v3 policy.

- `allocation-config.ts:83–170,176–236,283–370`: namespace parsing, read-scoped mount proof, full identity/byte checks, finite discovery and actual-launch accounting remain private behind existing interfaces. Diskutil bootstrap avoids recursive runtime authorization. Hard termination remains confined to the new metadata command and settlement waits for actual close. Existing public surfaces and create transport remain intact (ADR-0002/0005/0009; implementation plan).
- `observed-allocation-backend.ts:34–35`: only the three authorized mapping branches change; the exact Xcode guard and original assertions remain unchanged (fixture ownership transfer).
- `observed-cryptex-runtime.ts:28–134` and `observed-cryptex-runtime.test.ts:1–489`: the new fixture composes the existing temporary fixture and injects filesystem/process behavior through the same interfaces used by production. Policy tables and termination tests keep their mechanics local (implementation plan’s host-test isolation rule).

## Heuristic judgments

**0 material findings.** Proof data has a small private type, identity comparison is centralized and helpers name their responsibilities. Repeated fixtures/matrices express distinct trust surfaces. No introduced scattering, speculative public seam or duplicated parser warrants refactoring.

## Evidence and limits

All four committed file hashes are in `static-audit.json` and the input manifest. Independently matched 441 committed source paths, 437 protected base paths, both archived 69-file builds and 25 retained receipt/output sets. Read both 491/491 focused and 340/340 coverage logs, typecheck/build logs, genuine red and historical failures.

**Host gates are not accepted:** Node26 default failed, 1858/1985 with 127 failures; exact24 was held. Root identified a separate protected fixture mapping gap and authorized a successor repair. The failed receipt is preserved.

Initial-red test/fixture and first-green test bytes are exact-hash reconstructions, not contemporaneous archives. Both overlapping 349-test failures remain preserved. Old handoff hashes were recovered from integration commit `360dd8fa` after Root amended scope. This review pins dad’s committed bytes; current tests may belong to its successor.

No tests/builds/probes or candidate edits were performed by this reviewer. No installed/native/live/ticket12 acceptance.

Standards: **0 documented breaches; 0 material heuristic findings.**
