# Scripted feasibility: deterministic execution and Jev assertion checks

Type: prototype
Status: claimed
Claimed by: Codex main; gpt-6-sol high implementation and test agents
Blocked by: 20

## Question

Can an explicit action script run safely without host intervention, while Jev reliably judges assertions at declared checkpoints?

The owner approved evaluating this direction after three autonomous-navigation no-go results. The reviewed protocol and implementation plan will live in [scripted evaluation](../scripted-evaluation-plan.md). Keep the prototype in `spikes/scripted/` until its live evidence supports production integration. Preserve all prior experiment sources, corpora, and results.

Resolve with deterministic action tests, a frozen owner-reviewed fresh assertion corpus, one evaluation against preregistered criteria, and an explicit go/no-go. A passing result authorizes only the scripted product contract. Installed-host runs, baseline measurements, final production review, and release remain separate work.

## Progress

Prototype source and focused tests are archived in `2222fc2`. The experiment source digest is `dbdb58f782d86191a2d35b7a932b0ca9cc38568503d1908c03310795f6c44884`; it binds package versions, snapshot contract/parser, assertion schema/projection/adapter, harness, CLI, and assembler. The integrated check passed 127 tests with zero skips, type checking, and build. [Test review](../scripted-test-review.md) separates those checks from the pending live evidence.

All 24 fresh captures and independent visual/label audits are complete. The [frozen corpus review](../scripted-corpus-review.md) records hashes, request budgets, and oracle-isolation checks. Owner label approval has been requested; no approval has yet been recorded and no scripted assertion evaluation has run. Preflight budget and occlusion findings are retained; the protocol's caps and thresholds remain unchanged.
