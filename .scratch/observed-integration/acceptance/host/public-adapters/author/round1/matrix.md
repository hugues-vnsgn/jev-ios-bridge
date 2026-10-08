# Ticket08 public adapter matrix
Oracle: accepted public/allocation/seam contracts; ticket08 and Root dispatch.

| Gate | Scenario / input | Expected | Surface / planned case |
|---|---|---|---|
| H01 | startup/help/MCP list, no key, on/off/exact flag | zero store initialization, SDK construction, network/backend; off omits only prepare/start | CLI subprocess + MCP stdio + lazy composition |
| H01/H02 | strict action/allocation/read/cancel input, oversize/bad version/unknown paths | safe complete operation error; zero effects; acceptanceKind correct | both adapters |
| H03 | identical/conflicting starts/prepares, lost reply | authoritative retrieval/conflict; zero repeated calls | stdio + separate processes, isolated fake store |
| H05 | prepare normal exit, action later process | parked readiness survives; fresh capture; exactly one touch, no boot/install/launch | CLI subprocess |
| H05/H09 | observed four outcomes; active/finalizing/unresolved; historical optional fields/busy state | full unchanged authoritative JSON, summaries/evidence; exact outcome exits and isError | CLI/MCP/goldens |
| H09 | get wait timeout/transport abort/signals | only wait stops; state bytes invariant; 130/143 | stdio and subprocess |
| H05/H09 | signal/stdin shutdown while owned prepare/action; parked ready | immediate local revocation, bounded close; no unrelated cancellation/ready retirement | subprocess + fresh resolver |
| legacy | old CLI/MCP contracts | old goldens/schemas/replies/exits unchanged | existing contract/MCP/CLI suites |
| package | compiled installed entrypoints | seven adapters shipped, startup key-free | build + packed entry inspection/subprocess |

Each row needs raw output, explicit assertion counts/skips and final hash association. Live devices and production initialized stores are outside authorization.
