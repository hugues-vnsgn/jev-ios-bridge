# Cryptex implementation review handoff

Status: prepared; Root supplies the frozen candidate SHA and final gate receipts before dispatch.

## Shared review inputs

Review the candidate over exact base `38aa879c3954c9d7742ef04059cad4d2fc824c87` in `fix-installed-cryptex-runtime`. Root will pin `git diff <base>...<candidate>` and the commit list. The normative inputs are the frozen [Cryptex v3 policy](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/cryptex-policy-proposal.md), SHA `e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13`, its [owner approval](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/owner-cryptex-trust-decision.json), and the [implementation brief](installed-cryptex-repair.md). The proposal's historical unapproved status is superseded by that exact decision.

The [shared fixture transfer](../observed-integration/acceptance/host/runtime-visibility-2026-10-09/cryptex-fixture-map-ownership.json) authorizes only the private prefix, exact `/` mapping branch and leading identity branch for the owned temporary root/descendants. Preserve the baseline fixture hash, original assertions and accepted Xcode command guard. Four product paths may change: allocation-config source, that shared fixture, and two new Cryptex suite/fixture paths. The accepted baseline has 439 paths; 437 remain protected. Candidate total is 441 with 69 compiled JavaScript paths. The parser module/tests and Xcode output limits are protected.

Read raw logs before judging verification claims. Independently rehash the focused/default Source and compiled manifests, original red source, new fixture correspondence and evidence inputs. Verify both exact Node versions, actual default commands and complete counts, zero skips, typecheck/build, genuine observed-layout reds before Source edits, and mapping reds before fixture edits. Preserve every failure and distinguish controlled reruns from original results. Coverage is supplementary evidence.

Both reviewers are nonauthors of this implementation. Read AGENTS.md, tracker/domain instructions, applicable domain/ADR material and code-review. Work read-only on candidate/product and accepted evidence. Write private new files only under `cryptex-implementation-review/spec` or `cryptex-implementation-review/standards` inside the runtime-visibility evidence parent. Root controls commits. Tests, builds and native/system/device/store/config/key/SDK/MCP/backend queries require a separate Root window; this review is static and retained-evidence only.

## Spec axis

Use `/root/xcode_parser_spec_review`. Map every v3 requirement to Source and exact regression assertions. Report missing/partial requirements, incorrect implementations and scope additions separately, with quoted policy clauses and file/line evidence. Check bootstrap authorization avoids recursive proof; fresh pre/post proof is scoped to each read; gid/type/device/full identity and bytes stay stable; overlapping artifact roots cannot bypass Cryptex classification. Check all bounds, explicit-ID ambiguity, cancellation before operations, actual nested launch accounting, and new diskutil termination tracks actual close through delayed/ignored termination. Preserve strict policy elsewhere and existing create behavior. Document every clause in correspondence; keep the findings report under 400 words.

## Standards axis

Use `/root/installed_path_standards_review`. Apply documented repo standards and the complete Fowler smell baseline in code-review; distinguish cited rule breaches from heuristic findings. Review each changed file/hunk, keeping tooling checks separate. Evaluate whether namespace parsing, mount proof, stable descendant validation, bounded discovery and termination remain behind the existing interfaces. Report concrete material findings with file/line/hunk and cited rule or labelled heuristic; keep the findings report under 400 words.

## Completion

Freeze separate reports, input/output hash manifests and auditable correspondence. Each axis must state PASS, FAIL or UNVERIFIED for this delta, with exact base/candidate and evidence limitations. The author cannot review its own implementation. These reviews do not accept repaired installed startup, actual native compatibility, live cases or ticket12.

## Bounded re-review after public fixture failure

Old dadde33a has a failed Node26 default and one fixture-boundary Spec gap; exact24 default is held. Root transfers only the separate public child mapper in tests/fixtures/observed-cli-server.ts, with original hash and pure-string red/green both Nodes. Read the new cryptex-public-fixture-map-ownership.json receipt before the new candidate. Review that fifth-file delta and updated tests/manifests; protect436 baseline paths and require441 Source/69 compiled plus both actual default gates. The production Source policy remains unchanged. Preserve old four-file/static reviews and every failure.
