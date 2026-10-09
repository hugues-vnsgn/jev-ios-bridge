# Actual-default failure handoff

Candidate `4fa9cc99a94ebb8c79e6d1fe347ccb83745da13d` remains frozen over `720cb380d07102d72b20a6a4f5f7787a0ab88f2b`.

| Actual unmodified npm run check | Counts | Exit / actual close UTC |
| --- | --- | --- |
| Exact Node 26.8.1 | 2198/2198 pass | 0 / 08:21:58.790962 |
| Exact Node 24.0.0 | 2198 total, 2195 pass, 2 fail, 1 cancelled | 1 / 08:24:47.928771 |

The first emitted failure was observed-artifact.test.ts:133 exceeding its unchanged 1000 ms test timeout. The final raw summary also reports observed-crash.test.ts:94 expecting 1 but receiving 0 for H06.03 CLI beforeCommit response fault, and observed-public-races.test.ts:73 / observed-host/harness.ts:108 not reaching backend:snapshot-ui:1 for H05.01 MCP durable cancel. These are protected tests. No further root cause or flakiness is inferred.

Both recorded command children closed naturally. Source443/protected440 stayed unchanged, with no retry, process signal or Source/test/fixture edit. Node 24 failed in the test phase and did not reach its default build; compiled69 retained after that failure is from Node 26's completed default build. Before the freeze, focused704/704, coverage553/553, typecheck and build passed on both Nodes, and both 69-file build vectors matched.

The original failure output, first marker locations, complete final blocks, argv/environment-name/PID/time/exit receipts, all historical reds and the three-file Source freeze are preserved. Predefault reports remain historical and unchanged. The prepared success-seal script was never executed; this failure index is authoritative. All private artifacts and explicit operational/self exclusions are sealed in final-evidence-manifest.json.

Full-default verdict: FAIL on Node 24. Root diagnosis and any further gate grant are required. Author is idle. Independent review, integration/native compatibility and live acceptance remain pending; no native/device/key/store operation was performed by this author.
