# Isolated Node 24 diagnostic

Exactly one anchored three-case invocation on frozen `4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d` closed exit 0 at 2026-10-09T08:30:08.016092Z: 3/3 passed, no failures/cancellations/skips/todos.

The metadata cancellation case completed in 7.398375 ms, H06.03 CLI beforeCommit in 1410.605792 ms, and H05.01 MCP durable cancel in 1178.968542 ms. Two existing-harness public/backend archives were retained before cleanup. The CLI trace contains one touch and the beforeCommit finalization fault; the MCP trace contains backend:snapshot-ui:1 and no touch. Complete calls, milestones, command results and applicable MCP/public-wait traces are hashed in result.json. No forbidden-network milestone or signaled command child was observed.

Source443/protected440 and compiled69 remained unchanged before/after. All 481 immutable prior evidence files rehashed unchanged. Test/fixture/Source bytes, timeouts and subprocess behavior were unchanged. The environment contained only PATH, HOME, LANG, LC_ALL and the new private HOST_EVIDENCE_DIR.

No failure cause was reproduced in this isolated invocation. The original Node 24 full default remains failed and its root cause unresolved. Those defaults lacked HOST_EVIDENCE_DIR; removed original public fault traces cannot be reconstructed. Fresh isolated traces are separately identified and do not replace the original 2198-test failure.

Author is idle pending Root diagnosis or a new explicit window.
