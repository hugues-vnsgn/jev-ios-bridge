# Standards ADR follow-up

**P2 closed** for commit `70169e87fa59113f1353c61fb90dfe1fc7bf5f2b`.

Reviewed only:

`git diff a3e6c4e3cbecd0bba345c3ac2004ff4530141e3a...70169e87fa59113f1353c61fb90dfe1fc7bf5f2b -- docs/adr/0007-simulator-presentation-and-a-bounded-ios-point-tap-exception.md`

The final ADR content SHA-256 is `1ad352d842e153802d2c653b63a5dc4c607e84cadd5ee7fa54f0b4c3bb8c25eb`, matching the supplied identity.

- **ADR-0007:24** replaces unconditional nonfatal presentation with the actual distinction: “An acknowledged terminal failure produces a warning when device issuance remains open.” It explicitly states cancellation, timeout and unconfirmed outcomes close issuance and fail preparation, retaining the lease for unconfirmed operations. This matches `src/device/index.ts:815` and `:817` reviewed originally.
- **ADR-0007:27** now explicitly places the invocation through durable shared admission and the lease command ledger. It requires local settlement before lease release, preserves the distinction from native settlement/release, and records the amendment with its ADR-0008 link.

These changes resolve both parts of the original documented-standard conflict without weakening the conservative admission policy. No new finding in this bounded amendment.

The two original P3 duplication advisories remain recorded. The original `standards.md` is unchanged (SHA-256 `3ed38ebecfd2842dd8a3c910abad1354029ffe796e81604a74103c3bfa2a7aa5`). This follow-up is static review only: no tests, checkout, account authority or native actions were performed, and it makes no claim about root's pending documentation checks.
