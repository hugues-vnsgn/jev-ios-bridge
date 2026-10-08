# Unknown-creation evidence location

Root decision: project the already persisted absolute allocation `evidenceDirectory` into snapshot `evidenceRefs`, deduplicated with stored references. Do not synthesize a file-specific diagnostic reference or change recorded outcome, authority, guard or capacity. No store extension is required for this location guarantee. Implementation acceptance remains pending ticket07 review.

Independent reviewer: capacity_spec_review, gpt-6-astra high; bounded normative reads at `fff5f10a45ac2e7a48c0fb3f1dcf9ce6a22a850e`, no candidate inspection, edits or tests.

## Supporting contract

- [Allocation contract](../../evidence/allocation-contract.md) defines `evidenceRefs` without a file-only or exhaustive-manifest guarantee and requires unknown-creation refusal to identify its allocation and evidence.
- [Seam decision](../../evidence/seam-decision.md) requires a durable association between identity, evidence directory and terminal authority, with the location returned through the shared resolver.
- [Public contract](../../evidence/public-contract.md) requires persisted absolute pointers across restart/cwd changes, returns pointers rather than arbitrary content, and explicitly permits the guard creator's `evidenceDirectory` in errors.
- [Admission decision](../../evidence/admission-decision.md) permits diagnostic append while quarantine remains unchanged and separates rendering/export from terminal publication.
- [Validation matrix](../../evidence/validation-matrix.md) requires stable evidence paths, immutable uncertainty and explicit missing proof.

## Limits and verification

The directory pointer does not attest to successful diagnostic-file publication, contents, completeness or integrity. A crash between quarantine commit and diagnostic write may leave no file. Missing required acceptance evidence remains UNVERIFIED; later diagnostics cannot promote outcome or clear the guard. A stronger file-specific durable manifest would require a deliberate store extension.

Ticket07 must assert the persisted directory projection for malformed/nonzero/lost creation and fresh retrieval across process/cwd boundaries, with no backend call or logical store mutation. Raw files remain private, bounded diagnostics. This decision grants only renderer use of an existing durable pointer.
