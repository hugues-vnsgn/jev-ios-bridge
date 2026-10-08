# Independent admission design review

2026-10-08. Model: `gpt-6-astra`, high effort. Read-only review of the resolved admission, inventory and seam decisions against baseline source. No device operations or implementation acceptance.

No blocker in those completed decisions. Two composition requirements must be settled by the public-contract and lifecycle tickets:

- Reserve global declared action identity and immutable preparation intent atomically before creating a simulator. Device-bound admission alone is too late to stop duplicate concurrent requests creating multiple allocations. Require a cross-process duplicate-start test with one creation maximum.
- Specify admission after creation loses its reply and leaves the UUID unknown. Capacity retention alone does not identify an orphan. Define refusal for requests whose independence from the unknown allocation cannot be established, covering legacy and supplied-inventory paths. Names and dead PIDs are not ownership evidence.

Finalization explicitly orders required cleanup/evidence before terminal transaction, resolves ambiguous commits by authoritative read, and separates export failures. Migration explicitly requires old-writer quiescence, preserves uncertainty/replay history and custom-root exclusions, and disclaims enforcement against older binaries. These are future implementation gates, not current live acceptance.

Root forwarded both requirements to the contract/lifecycle agents before their decisions were finalized. Final plan review must verify the resulting text and tests.
