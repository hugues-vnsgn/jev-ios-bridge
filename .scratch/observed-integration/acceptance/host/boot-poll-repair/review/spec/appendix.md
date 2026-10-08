# Exact association and evidence

Original SHA2560b0358c4d031f24aef59cb0bf70a5bab7be2dd999fd168295cd6a5b48d7e794f, parent blob a63386a6 (full blob accessible through parent). Corrected full SHA/blob and all15 evidence files are pinned in before-hashes.json and after-hashes.json. reviewed.diff contains the exact single-test change; snapshot/ preserves the16 commit paths. All freeze.json artifact byte counts/SHA256 checks passed.

Read-only commands: git diff/show/rev-parse, Python SHA256/byte comparison, source/contract nl/rg. No test, build, production store, device, environment/key or network operation. Negative commands/raw logs and focused success commands/raw logs were read from Root's committed boot-poll-repair directory and preserved byte-for-byte. The controlled negative adds150ms to the fake first listing; it is a scheduling reproduction, not a production defect or direct unmodified test run. The focused corrected tests retain exact assertions and add boundary checks.
