# Installed Cryptex runtime candidate

Commit: `dadde33a36440db6d9414adf84f80916caa9d2b3`. Base: `38aa879c3954c9d7742ef04059cad4d2fc824c87`. Branch: `fix/installed-cryptex-runtime`.

## Change

The private Cryptex boundary in allocation-config now discovers only the approved namespace and fixed runtime suffix. Each conversion requires fresh typed read-only mount metadata before and after, complete namespace/component identities, same-device opened/final file checks and stable bounded bytes. It preserves public interfaces, the fixed Xcode 128 KiB output exception and the shipped parser. Actual launches, including internal mount queries, are capped at 8192 per preparation. Only diskutil gets a deadline of 10 seconds and a 250 millisecond grace between SIGTERM and SIGKILL; its promise stays pending until child close.

The shared fixture changes only its approved exact-root/private installed mapping and the owned-temp identity branch. The new fixture isolates the full Cryptex ancestor tree and preserves inherited temporary account/artifact paths. No host permission settings, mounts, runtimes, devices, real stores or SDK/backend operations changed.

## Verification

All final commands ran serially on verified Node 26.8.1 and 24.0.0 against the same 441 Source hashes. 437 protected candidate files are unchanged; only four product files changed. Both final package builds produce identical 69 compiled files. 68 match the reviewed base exactly; only allocation-config.js changes.

| Gate | Node 26.8.1 | Node 24.0.0 |
| --- | --- | --- |
| Focused five suites |491/491 PASS|491/491 PASS|
| Owned coverage plus config/parser suites |340/340 PASS|340/340 PASS|
| Typecheck |exit0|exit0|
| Actual package build |exit0|exit0|
| Owned Source coverage |97.97% lines,93.37% branches,86.76% functions|same|

No final failures, cancellations, skips or TODO cases. Raw stderr is empty for each final command. Node 24's SQLite experimental warning remains in reporter stdout. The 166 new cases cover every policy clause and retain the original observed-layout assertions. See clause-regression-matrix.json, candidate-source.json, verification-index-precommit.json and each final command's raw stdout/stderr/receipt. Parser/Xcode output files, tests, package and lockfile remain protected.

## Retained failures and scheduling correction

The two genuine observed-layout cases first failed on both Nodes against unchanged Source. Independent pure-string root/private mapping assertions then failed before their narrow edit. Extending private initially remapped existing /private/tmp fixture paths. Two focused runs accidentally overlapped and hung at an allocation test waiting for a callback after CONFIG_INVALID. Their originals remain at 349 tests, 347 passed, 1 failed and 1 cancelled each; neither is authoritative. Root authorized discovery and SIGTERM only on their six verified owned test processes; wrappers emitted actual exit 1 receipts. No unrelated process or native runtime/device probe ran. The narrow temp identity branch has genuine3/8-to8/8 mapping red/green on both Nodes. Identical serial focused reruns subsequently passed 477/477; final extensions passed 491/491. A private validation flock now prevents overlap and records child PID/group before waiting.

The owned new fixture's analogous temp mapping regression and its first failed correction are retained; exact-root/descendant/account checks are now green. Every failed receipt is preserved. Base Source/shared-fixture and first-green Source bytes were archived before later changes. Initial-red/first-green test and initial new-fixture bytes were reconstructed after extension, exactly hash matched and explicitly labeled non-contemporaneous in historical-bytes.json. Current final four-file/compiled snapshots are contemporaneous.

## Pending gates and limits

This is an authored candidate with focused verification; independent Spec/Standards reviews and actual default gates are pending. It implements the approved mode-based namespace-manager trust. It does not certify ACL exclusivity, SIP flags, cryptographic mount provenance or atomic protection against trusted managers replacing ancestors. Mount/file checks detect observed changes. Actual installed compatibility, operational entry and L01-L05 remain for the sole designated operator after Root's gates. No Source/test/fixture edit is planned during defaults or reviews.

Request the coordinator's separate full-default serial window against this immutable commit and 441 Source/69 compiled vectors.
