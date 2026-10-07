# 02 — Observe an original native reference and its replacement

Type: task
Status: resolved

Implement the standalone native target and owned fixture per ../spec.md and the
architecture record. Own only spikes/native-owner/native/ and fixture/. Use the
frozen record schema. Test meaningful native-response failures and limits through
the observation Interface; build the actual study and fixture. No live device
execution, input or WDA setup. Commit local work; supervisor integrates, reviews
and lands. Raw observations do not accept IDB 01 or establish native settlement.

## Answer

Implemented the standalone target, ABI/admission/accounting Module and UIKit
fixture in [PR 44](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/44).
The first joined metadata run exposed numeric JSON completion flags; the fix is
in [PR 46](https://github.com/hugues-vnsgn/jev-ios-bridge/pull/46), source
`07874551ff5015837b5400cd6c2a4aa03c6d92ad`.

All 25 native policy/serialization tests pass. Both actual iOS targets build
without warnings, with source/product/test-plan bindings verified. Independent
Standards and Spec reviews cleared the implementation and fixes.

This resolves the native implementation/build ticket. The reference study
remains unrun because the failed metadata run retains ownership under the
frozen contract. [The evidence report](../evidence/2026-10-07/report.md) preserves
that result and the limits. No production ticket or native guarantee is accepted.
