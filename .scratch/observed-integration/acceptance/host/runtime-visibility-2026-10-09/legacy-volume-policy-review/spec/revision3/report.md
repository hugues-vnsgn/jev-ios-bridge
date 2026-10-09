# Spec review: legacy-volume proposal revision3

**PASS for the bounded proposal review: 0 findings.** Both earlier FAIL reports remain unchanged.

Final proposal SHA256 `14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492`; predecessor v2 SHA256 `88e1b5d650bcf393647b67c9043e811e7d7e7d99891296261be060d64dbc959c`. Product remains `3edf247ab44d3332bc4bab5f3a43104536d84ce9`, Source SHA256 `7d5798570970ca8de9fcca980b39662c4cf2b9be939e1ad31f23e9383e82fe62`.

V3:23/37 resolves the numeric-identity P2: snapshots and opened handles require lossless values or refusal, prohibit bigint/rounded Number coercion, preserve supplied timestamp precision, and require large-ID collision/timestamp regressions. V2's enumeration repair remains intact at v3:27/37.

Connected absence semantics follow v3:13/27/37: retain initial Volumes ENOENT as a presence state distinct from an empty directory; stable absence preserves default/Cryptex behavior; final appearance or disappearance refuses. Initial absence cannot skip final comparison. The uid0 ancestry rule remains restricted to recognized mounts at :15. These are implementation obligations, not new guarantees of atomic ancestor pinning.

V3:9 correctly qualifies the completed diagnosis. Exactly two successful closed fixed diskutil queries retain 3,092/3,093 raw bytes and exact MountPoint plus three typed false values. Inspected mounted modes fit the proposal; runtime byte/plutil/compatibility calls are zero. Original `/usr`, `/usr/sbin` and diskutil inode integers remain uncertain. The responses do not certify exact system identity or runtime compatibility.

Bounded audit **117/117 PASS**, 53 inputs rechecked; sealed v2's 1,546 checks reused. Root final retained audit matches SHA256 `f6399bfaff67ccdb8642ecc1111fe4680d7d0589b03cc632529e3533ee25f1ea` and records 4,185 checks with system identities explicitly QUALIFIED.

Owner approval, Source implementation/regressions, installed compatibility and operational/live/ticket12 acceptance remain pending. No tests, Source execution or native queries. [Connected clauses](clause-matrix.md), [audit](evidence-audit.json), [hashes](inputs-manifest.json).
