# Historical allocation lookup and busy errors

Root clarification for the five ticket07 Spec repairs, 2026-10-08. This resolves projection details using existing accepted capabilities; it is not implementation acceptance or a store extension.

## Historical records

Allocation-contract:52 assigns historical experiments stable read-only allocation IDs without preparation permission. Its capacity rule at line74 excludes historical protected devices from the new reservation count. Public-contract:105 permits additive optional output fields. The independent reviewer confirmed this interpretation after its five-finding review.

Use the durable imported identity, action ID, device and recorded evidence pointers. A historical snapshot has terminal phase, empty new readiness evidence, zero new reserved bytes and `capacityHeld:false`. Add `readOnly:true` and `historicalOutcome` to distinguish recorded observed history from new allocation preparation. These fields confer no preparation or consumption permission.

Historical observed successes map to retained/action_completed, historical refusal to retained/refused, and durably imported uncertainty to quarantined/uncertain. A verified current quarantine may lower allocation disposition while preserving the historical observed outcome separately. Read a consistent authoritative view; merely busy admission, missing/unreadable storage or missing evidence cannot establish a new committed quarantine. Unverifiable authority returns a safe store error or an unconfirmed snapshot with null outcome. No provisional file or current cwd supplies authority.

Use `reason:null` when migration stores no applicable allocation reason. Do not fabricate BOOT_FAILED, CANCELLED, PREPARATION_UNCONFIRMED or RETAINED_UNUSED from a historical observed result. `cancellationRequested:false` describes the absence of a new allocation cancellation request; it does not certify whether an old attempt was cancelled.

Historical cancel and retire retrieve the same immutable projection. Allocation-contract:54 requires terminal cancellation retrieval; its retention rules require idempotent terminal/quarantined retirement without claim clearing. No new retired_unused outcome, mutation, capacity reclamation or ready state is created for an import.

## Busy operation errors

Public-contract:79 requires ALLOCATION_BUSY to include the executing action's ID/current state and direct the caller to explicit action cancellation. Root chooses additive optional error field `state`, with the existing allocation-state type, alongside the accepted `actionId`, `allocationId` and evidence fields. The safe message identifies `cancel_observed_action`/`observed-cancel` as the follow-up. Populate context from the verified current durable record; no fabricated snapshot or vendor message is returned.

Retirement also refuses an active preparation under allocation-contract:103. Its verified context has `state:preparing`; describe active preparation and direct any cancellation to the allocation interface. The executing action cancellation direction applies only to `state:executing`. Cancellation of an allocation itself returns busy only for execution. Preserve this operation distinction when validating the durable context; healthy preparation is not a storage failure.

These output additions remain observed format version1 under its additive-field rule. New adapter golden fixtures must include the accepted behavior; existing frozen goldens are not transferred or changed by this clarification.

## Required repair evidence

All five original Spec reproductions remain unchanged and preserved in [the round-one review](allocator/review/round1/spec/review.md). Repairs must verify historical completion/uncertainty/protected disposition, fresh-process/cwd stability and read/cancel/retire byte invariance; busy action context and zero repeated effects; global preflight conflict before every probe; verified blocking evidence; and quarantine after failure evidence publication. The independent re-review must match the final source manifest and commit.
