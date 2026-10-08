# Test Report — 2026-10-08 — source/artifact adapters

**Verdict: SHIP for the bounded adapter subset; integration/live acceptance UNVERIFIED.**

Oracle: ticket 04, allocation contract prerequisites/staging, inventory decision receipt/uncertainty rules. Base: b8c4a50942551bdf95d00036a6d2f7bb6142ff43.

| Scenario | Expected surface | Result | Evidence |
|---|---|---|---|
| Authorized create / denied create | exact create argv, UUID provenance / no process | PASS | observed-adapters-targeted-final.log |
| Missing/malformed/multiple UUID, nonzero, lost reply | CREATE_UNCONFIRMED, one attempt | PASS | observed-adapters-targeted-final.log |
| Abort/timeout ignoring process, late callback, double callback | no retry or late promotion; underlying operation remains tracked | PASS | observed-adapters-targeted-final.log |
| Invalid fixed identifiers, pre-cancelled request | no process | PASS | observed-adapters-targeted-final.log |
| Supplied configured provenance / duplicate inventory identity / missing attestation | selected canonical identity / refusal; no adoption | PASS | observed-adapters-targeted-final.log |
| Offline inspection, immutable private staging, source isolation | metadata + digest, 0500/0400 modes, no original mutation | PASS | observed-adapters-targeted-final.log |
| Bundle identity/platform/minimum OS, executable architecture/platform/minimum OS | compatible only; malformed/absent metadata refuses | PASS | observed-adapters-targeted-final.log |
| Universal executable host slice | correct declared architecture, explicit simulator metadata | PASS | observed-adapters-targeted-final.log |
| Internal and escaping/chained symlinks | internal links preserved; escapes refuse | PASS | observed-adapters-targeted-final.log |
| Source mutation during copy or metadata / stage mutation/permissions/additions | refusal; immutable digest verification fails closed | PASS | review-node26 and review-node24 logs; corrected mutation audit logs below |
| Permission change between path stat and descriptor open | descriptor binding and immutable descriptor check refuse | PASS | red-descriptor-immutable -> green-descriptor-immutable logs |
| Output-open ENOSPC / source-close rejection | source/output descriptors close independently | PASS | red-output-open-leak / red-independent-close -> corresponding green logs |
| Size, missing paths, unsafe staging permissions, process failure, metadata cancellation/deadline | bounded sanitized refusal | PASS | red-metadata-abort-bounded -> final targeted log |

Targeted command: node --import tsx --test tests/observed-sources.test.ts tests/observed-artifact.test.ts. 41/41 PASS, 0 skipped, Node 26.8.1; /tmp/observed-adapters-review-node26.log.
Minimum runtime command: supplied Node 24.0.0 binary --import tsx --test same files. 41/41 PASS, 0 skipped; /tmp/observed-adapters-review-node24.log.
Typecheck: npm run typecheck, exit 0; /tmp/observed-adapters-review-typecheck.log.
Full check: npm run check, exit 0, 1002/1002 PASS, 0 skipped, successful build; /tmp/observed-adapters-full-check.log. This is historical initial implementation evidence: it preceded the final filesystem-fault fixture, diagnostic/cleanup refinements, and these independent-review fixes. No claim that this full check covered the corrected tip; Root will run the integrated full check. Targeted Node 26/24 checks and typecheck passed on the corrected tip.

Evidence correction (2026-10-08): `/tmp/observed-artifact-red-immutable.log` and `/tmp/observed-artifact-red-source-mutation.log` show only EACCES fixture-cleanup errors. Those finally-block failures masked the intended assertions, so neither raw log establishes the previously claimed behavioral red. Raw logs were preserved unchanged. Their corresponding old green logs were likewise cleanup failures. Initial module-missing logs establish only absent modules, not behavioral TDD proofs. The original `/tmp/observed-artifact-red-metadata-abort-bounded.log` remains a valid reproduction: cancellation of an ignoring runner hit the explicit 1000ms test deadline before the fix.

New actual pre-fix regression proofs:
- `/tmp/observed-artifact-red-descriptor-immutable.log`: one failed test, Missing expected rejection, when fs.open changed staged Info.plist 0400->0600 after its path stat. `/tmp/observed-artifact-green-descriptor-immutable.log`: 1/1 PASS after descriptor/stat binding and descriptor immutability checks.
- `/tmp/observed-artifact-red-output-open-leak.log`: one failed test, source fd 14 rather than -1 after ENOSPC opening output. `/tmp/observed-artifact-green-output-open-leak.log`: 1/1 PASS after starting cleanup immediately after source open.
- `/tmp/observed-artifact-red-independent-close.log`: one failed test, output fd 15 rather than -1 after source close rejected. `/tmp/observed-artifact-green-independent-close.log`: 1/1 PASS after independent close attempts.

Assertion sensitivity audits (NOT original pre-fix/TDD reds): temporarily disabling immutable tree validation produced Missing expected rejection in `/tmp/observed-artifact-mutation-audit-immutable-red.log`; temporarily disabling the final source comparison produced Missing expected rejection in `/tmp/observed-artifact-mutation-audit-source-red.log`. Each intentional mutant exited 1; production code was restored in finally. `/tmp/observed-artifact-review-focused-green.log` then passed all five relevant tests on restored fixed code. No EACCES cleanup masking occurred in these new reds/audits.

Skills applied to the review fixes: diagnosing-bugs (review supplied the mechanisms; minimized deterministic regression loops rather than speculative hypotheses), TDD (three vertical red/fix/green slices), do-test (matrix and Node 26/24/typecheck evidence), Cook (existing reviewed plan, Root-authorized autonomous fix dispatch). No interface changes or additional write ownership. Independent re-review and integrated full check belong to Root.

Limits: only explicit modern Mach-O simulator metadata (LC_BUILD_VERSION platform 7), little-endian 64-bit arm64/x86_64 slices and normal big-endian fat/fat64 containers are supported; unsupported/missing metadata refuses. Absolute symlinks are conservatively refused even when their original target is inside the bundle, because unchanged absolute links would leave the staged copy. Relative internal framework-style links are supported. Largest executable inspection is memory-bounded by maxBytes; all bundle digests/copies stream in 64KiB chunks. Staging modes and digest verification do not stop the owning OS user or external tools; verify immediately before install, whose acknowledgement remains the final compatibility check. No real process helper, device operation, storage authority, budget admission, root configuration, production tool composition, or installed/live test was exercised here. Process and diagnostic writers are required/optional injected internal dependencies for root's allocator integration. Root supplies independent review; no nested agents or protected shared writes. Cook simplify unavailable; root assigned the maintainability review.
