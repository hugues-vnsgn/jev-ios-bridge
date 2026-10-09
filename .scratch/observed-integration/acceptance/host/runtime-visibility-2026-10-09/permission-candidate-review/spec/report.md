# Spec review — bounded PASS

Base: `4004ece782fc9448607605bfe3a54702f8622bb0`. Candidate: `a0e68917dca1816a6ca98315c2fc932a6fd2f2e8`. Exactly two committed files; nonauthor, read-only review.

## Findings

(a) Missing or partial requirements: none in this delta.

(b) Scope creep: none. Root explicitly authorized the fresh final-leaf repair.

(c) Incorrect implementation: none found.

Allocation contract line 78 requires the canonical `/Applications` ancestor to be a “nonsymlink directory owned by root (uid0), group admin (gid80), with exactly mode0775 and no extra permission bits.” `allocation-config.ts:136–143` implements those conditions only for canonical fixed Xcode paths. Lines 145–147 enforce strict owner/write/symlink/type checks on the fresh leaf. Descendants, other paths, metadata identity/bytes, allowlisted arguments, environment and budgets remain unchanged. Tests at lines 260–405 exercise both interfaces, exception negatives, unsafe descendants, alternate paths, metadata refusal and the explicit ancestor-identity limit.

## Evidence and limits

Independently rehashed 81 receipt/raw artifacts and checked raw counts. The current 435 protected files and both owned files match; actual default receipts bind all 437 before/after. Earlier focused receipts cover the separate 430-path inventory. All 68 compiled files match four manifests. Genuine policy red and fresh-leaf red precede their repairs. Frozen focused suites pass 78/78 on both runtimes; final default gates pass 1723/1723 with typecheck/build. Earlier Node26 1719/1723 umask failure and Node24 1720/1723 failure remain preserved. The filtered 3/3 diagnostic is not a full gate; Node24's original lower cause remains UNCONFIRMED.

Nonblocking limits: administrator/trusted-account namespace management remains trusted; ancestor identity is not atomically pinned. Installed compatibility, Cryptex support, live L01–L05 and final ticket 12 remain unverified by this review. No tests or probes were run.

## Hash binding

- Source: `cbf94978d97a8e1b2c9413f83a7fa75decdf9c2f40a325ee77b5c2c895fce69d`
- Test: `f92cd1d0e9ddd93e3c8b1dc04de7ffd4f84fd2c9f65f3055858210fd2949fb66`
- Author ledger: `06e08b920311716360e8ef89ef8731a9bbf29205836be93c83d7479c954bbaa9`
- Inputs: `review-inputs.json`, SHA256 `af218bf42ed034be2487d8c497e3a34447a4d96cb46dee7d1ad6e434d31b16de`
- Corrected independent audit: `evidence-audit-corrected.json`, SHA256 `8c78539875596dc95b5807c9439012e2907447ceadce91dc5ba4fdafd13f7277`

Verdict: 0 hard Spec findings for this frozen permission delta; no installed/live/final acceptance claim.
