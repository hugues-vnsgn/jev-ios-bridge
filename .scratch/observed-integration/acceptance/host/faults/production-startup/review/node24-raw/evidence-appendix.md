# Audit artifacts

- raw-startup/: unchanged CLI/MCP stdout/stderr, requests, guard traces, commands/summary plus explicitly retrospective launch receipt.
- source-correspondence.json: exact70 source/package/lock mappings to Root a274a5a and68 compiled build/npm/plugin mappings.
- installation-audit.json and installation-evidence/:37 command receipts and actual raw output pairs; tarball/plugin ZIP hash checks.
- raw-audit.json: independently parsed envelopes, counts and trace checks.
- before-hashes.json/after-hashes.json: no helper/guard/raw-source drift during review.
- probe.mjs/guard.mjs: reviewed snapshots, not executed by reviewer.

No original report or evidence was modified. Earlier static closure report lives under Root acceptance/host/faults/production-startup/review/final/review.md. The lack of contemporaneous launch-time provenance is preserved; current hashes are not represented as historical before/after hashes.
