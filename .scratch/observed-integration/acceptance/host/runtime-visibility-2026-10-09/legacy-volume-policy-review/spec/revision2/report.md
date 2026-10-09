# Spec review: legacy-volume proposal revision2

**FAIL: one new P2 missing/partial requirement.** V2:27/37 resolves the revision1 enumeration finding; this review found no wrong or unasked behavior.

V1 SHA256 `94ab01cb03679e8f92008a874e90cddaaa970e509799bb3c380fbe060f6a028a`; v2 SHA256 `88e1b5d650bcf393647b67c9043e811e7d7e7d99891296261be060d64dbc959c`. Product remains `3edf247ab44d3332bc4bab5f3a43104536d84ce9` / Source SHA256 `7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62`. Revision1 FAIL remains sealed unchanged.

## Finding

**P2: specify lossless identity handling.** V2:23 requires "full before/opened/final/after identity including path, dev/ino"; :27 binds candidate and namespace identities. Neither specifies lossless representation or refusal when integer identity fields exceed safe Number precision. Current Source:102 stringifies numeric Stats values. Distinct large inode integers can therefore compare equal after Number coercion. The retained precision audit identifies unsafe inode Numbers for `/usr`, `/usr/sbin` and `/usr/sbin/diskutil`; their original integers cannot be recovered. Require lossless integer identity values or refusal, preserve the timestamp precision supplied by the chosen representation, and regress distinct large identities that collide after Number conversion. Converting an already rounded Number to BigInt does not recover identity.

V2:27 now requires namespace snapshots, candidate capture, final complete entry-set comparison and refusal on observed changes. V2:15 preserves the unrecognized account-owner branch; these changes resolve the original scope concern without a kernel-pinning claim.

## Retained evidence and gates

Independent audit **1546/1546 PASS**. Exactly two successful closed fixed diskutil queries retain complete raw XML of 3,092/3,093 bytes, exact MountPoint and three typed false fields. Mounted modes/devices fit the proposed class; their recorded integer identities are safe. Runtime byte reads, plutil and compatibility calls: zero. Exact system-inode stability remains **UNVERIFIED**, distinct from the valid mount proofs.

Root final native audit was pending at initial capture and will be bound by the separate v3 review. Owner, implementation, installed compatibility and live acceptance remain pending. No Source edits, tests or native calls. [Connected clauses](clause-matrix.md), [audit](evidence-audit.json), [hashes](inputs-manifest.json).
