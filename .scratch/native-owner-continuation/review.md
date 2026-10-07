# Independent continuation reviews

Review base: study `b0bdd34`; AXe `b493d921`.

## Host Standards

Zero documented violations; one optional heuristic: guard state, uncertainty and resource kind are selected together using a persistent flag in study.py. A private grouping could reduce bookkeeping, but current two-guard code is readable and consistent. No blocking correctness issue found. Reviewer inspected meaningful red and 123-test green logs. The supervisor retained the explicit two-guard implementation rather than adding an abstraction for two fixed cases.

## Host Spec

PASS, zero findings. Independent review checked complete affected guard/reconciliation paths, red admission-loss reproduction and author/supervisor 123-test logs. Paired acquisition/check/release, uncertainty and existing-claim preservation match the approved prospective scope.

## AXe Standards

Zero documented violations and zero material heuristic findings. Poll/read cancellation, receipt clock accounting and byte bounds match the existing command rules. Command docs, changelog and both packaged skills were updated. Structural skill checks passed; their security runner is unavailable.

## AXe Spec

PASS, zero findings. Actual CLI regressions cover TERM/INT, original budget, ten-second ingress cap and exact input byte limits. No native capability was enabled. The supervisor independently passed the focused suite and verified six source hashes plus the executable against the manifest at `c40fe4c`.

## Initial native Standards review

Zero documented-standard violations. One blocking integration defect: the host counted all observed parent records as edges, including newly added provenance/comparison/termination records. Correct actual-edge accounting and a native-encoded 32-edge parser check are required. One optional test-setup duplication heuristic remains.

## Initial native Spec review

One P2: replies containing the requested key plus extra entries incorrectly reported key absence; an NSError suppressed an otherwise bounded scalar. Preserve observed presence/value independently of failed outcome. Add requested-key-plus-extra and false-plus-error regressions.

Both findings are assigned to their owning host/native agents. Final review and build verification pending.

## Final re-review

Both native findings are closed. Standards verified source-bound native root32 and over32 traces with exactly 32 sequential edge records, their distinct termination reasons, and acceptance only after explicit synthetic test framing. Spec confirmed requested-key presence and bounded values survive error/extra-entry refusals. Final native test log has 56 passes; the supervisor independently passed 125 host tests and the full-boundary parser checks. Zero unresolved correctness or specification findings; optional test-setup duplication remains.

Generic build/source receipt verification is recorded separately in verification.md.
