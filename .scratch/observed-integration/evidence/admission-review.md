# Independent admission design review

2026-10-08. Model: `gpt-6-astra`, high effort. Read-only review of the resolved admission, inventory and seam decisions against baseline source. No device operations or implementation acceptance.

No blocker in those completed decisions. Two composition requirements must be settled by the public-contract and lifecycle tickets:

- Reserve global declared action identity and immutable preparation intent atomically before creating a simulator. Device-bound admission alone is too late to stop duplicate concurrent requests creating multiple allocations. Require a cross-process duplicate-start test with one creation maximum.
- Specify admission after creation loses its reply and leaves the UUID unknown. Capacity retention alone does not identify an orphan. Define refusal for requests whose independence from the unknown allocation cannot be established, covering legacy and supplied-inventory paths. Names and dead PIDs are not ownership evidence.

Finalization explicitly orders required cleanup/evidence before terminal transaction, resolves ambiguous commits by authoritative read, and separates export failures. Migration explicitly requires old-writer quiescence, preserves uncertainty/replay history and custom-root exclusions, and disclaims enforcement against older binaries. These are future implementation gates, not current live acceptance.

Root forwarded both requirements to the contract/lifecycle agents before their decisions were finalized. Final plan review must verify the resulting text and tests.

## Contract follow-up

The public and allocation contracts now reserve action identity before creation and persist a host-wide unknown-create guard. Independent review found one lifecycle ambiguity: shutdown cancellation could retire ready allocations despite the cross-process handoff. Corrected the contract so the ready commit removes that allocation from active process-owned jobs; normal shutdown leaves parked readiness intact. Explicit allocation cancel/retire can retire it. Add a CLI prepare-exit → new-process start regression.

Final SPEC review confirmed the parked-readiness correction and corresponding H03/H05 gates. The core specification/contracts preserve the owner constraints with no remaining core blocker. Exact implementation-package completeness awaits the final briefs review.
