# Cryptex candidate Spec review: FAIL

Base: `38aa879c3954c9d7742ef04059cad4d2fc824c87`  
Candidate: `dadde33a36440db6d9414adf84f80916caa9d2b3`  
Oracle v3 SHA256: `e8cbff80f2a1610a6e0b4ec1b372086e490f0bc8a8030d6ecf2e5c7105859d13`

## Finding

**[P1] Partial fixture isolation / inherited default regression.** New discovery starts the full Cryptex ancestor snapshot at allocation-config.ts:294. The separate public fixture mapper at tests/fixtures/observed-cli-server.ts:33 handles neither `/` nor `/private`; its lstat wrapper at:35 therefore reaches the native ancestor chain. The brief requires "map /private paths into temporary files"; v3:27 requires actual default gates. The actual Node26 default has 1,985 tests: 1,858 pass, 127 fail, zero cancelled/skipped/todo, exit 1. CLI/MCP failures include `HOST_PREREQUISITE_MISSING` before preparation. Root classified the native filesystem escape; the injected Source refuses diskutil before a metadata child launches. Repair requires the separately transferred public mapper and unchanged assertions/process guards. Node24 was held after this failure. This candidate cannot satisfy the full gate.

## Other requirements and scope

No additional missing, incorrect or out-of-scope production behavior findings established. The finite bootstrap, exact typed mount proofs per conversion, full identity/device/byte checks, overlap priority, explicit-ID ambiguity, bounds, cancellation and diskutil-only termination match the approved clauses. Public interfaces, strict outside paths, parser and Xcode guard remain protected. Detailed correspondence is adjacent.

The audit matched 441 working/committed Source paths, 437 protected base paths, the three authorized shared mapper branches and both original regression bodies. All 46 retained raw receipts match their hashes. Both final focused suites pass 491/491; coverage 340/340, typecheck/build pass. Both 69-file compiled snapshots match, with 68 unchanged from base.

This static review accepts no installed/live/ticket12 outcome. Initial test/fixture historical bytes are hash-matched reconstructions; first-green Source is contemporaneous. Mode trust detects observed changes and does not certify ACL exclusivity or atomic ancestor pinning.
