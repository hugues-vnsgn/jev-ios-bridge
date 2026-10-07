# Preserve process evidence and reconcile one retained metadata setup

Owner instruction: “go ahead”, after the next-step analysis on 2026-10-07.
Implement, review, run the applicable live steps serially, and land the PRs.
The original metadata result stays `retained / RECORD_SCHEMA`; this effort
does not repair it or accept any of the 23 production guarantees.

## 1. Process accounting after a record refusal

Keep `run_study(plan, configuration, dependencies)` as the host Interface.
When stream validation or its record callback refuses an observation:

- Latch the first exact refusal reason and write the stop-admission file
  immediately. Do not parse/admit subsequent observations or fixture requests.
- Continue observing the already-owned child and its process group within the
  original monotonic deadline. Do not issue another native operation, renew the
  allowance, signal/kill the child, or replay the command.
- Independently persist the parent return code, group/stream completion and
  final command receipt when positively observed, even though records failed.
- The study result remains refused/retained according to resource ownership;
  record rejection cannot become ordinary metadata completion or cleanup.
- If deadline, output/Adapter or inspection uncertainty prevents completion,
  retain owned work. Preserve the original protocol refusal as the result reason
  and separately record why process observation ended; do not replace the first
  refusal with a later expiry. Existing non-stream process failures retain their
  established reason. Keep current byte limits and file-backed output.

Tests cross `run_study`: numeric flags then delayed child exit; rejection then
nonzero exit; rejected stream then surviving descendant/deadline; rejection stops
a later recreation callback; valid metadata behavior; and a real harmless child
that emits a bad record and exits naturally. Do not use tests that only assert
an internal helper mirrors its own implementation.

## 2. A separate metadata-resource reconciliation Interface

Implement `reconcile_metadata(retained_directory, configuration, dependencies,
apply=False)` plus a CLI. Default is inspection only. Use the existing process,
clock, evidence and identity mechanisms through private composition. Keep the
reconciliation-specific decisions in `host/reconcile.py`; do not weaken `_Stream`
or the ordinary metadata cleanup contract.

Recognize only the registered historical case in `approved-case.json`. The
case pins the request, original directory, archive and build binding hashes,
native source revision, original process identities and the installed app path
observed by the supervisor's read-only preflight. Arbitrary caller-supplied
approval data, reference studies, other wire failures, altered receipts and
unknown cases must refuse before mutation.

The exception rationale is specific: the bound native source's metadata plan
can invoke its accessibility Interface getter and inspect signatures, but never
enters `referenceStudy:`. Its exact historical output records zero explicit
app-element/input queries, returned local methods and released local references;
the two C-comparison completion flags were boxed as numeric ones. The archived
class marker follows completion. This is source-bound metadata setup accounting,
not a native accessibility/input settlement certificate or global XCTest census.

The missing historical `xcodebuild` return code remains unknown. Success text
and later process absence must never be recorded as an actual exit code. The
new exception requires fresh absence of every recorded process/group and any
current runner instance, rather than reconstructing that lost code. It authorizes
disposal only of this proven metadata-only setup, after all gates below pass.

### Gates before any cleanup

1. Validate configuration, exact registered case, immutable archived provenance
   and all relevant original receipt bytes. Verify the full archive manifest and
   original directory's critical files against its registered archive. Reject
   symlink escapes and bounded-file/JSON errors. Do not mutate any original file.
2. Check original `metadata` plan, retained reason, request and owned resources,
   exact original native records/class ordering, zero explicit queries/input,
   and the sole known wire defect. Preserve original JSON types. Any diagnostic
   normalization for checking the known exception is separate from `_Stream`
   and never rewrites or accepts the original completion record.
3. Verify current simulator identity/runtime/name/state (`Booted`) and positive
   fixture absence. No boot, install, launch, test, input or accessibility query
   is permitted during reconciliation.
4. Freshly verify both historical PIDs absent with exact `ps` rc1/empty output,
   and inspect all process groups: no member of the historical xcode group and
   no runner executable instance. Inspection failure or any present/reused PID
   refuses cleanup; never signal it.
5. Resolve the current runner container through `simctl`. It must equal the
   registered preflight app path under the exact owned simulator, with expected
   runner/plugin bundle IDs, no symlink/extra file, and the exact five runner
   file hashes in the approved original build binding. An absent, foreign,
   relocated, changed or ambiguous installation refuses cleanup.
6. Inspection writes a new receipt and returns retained with
   `METADATA_RECONCILIATION_READY`. It changes no device/app/original receipt.

### Apply and one-use ownership

Apply rechecks every gate under one fresh reconciliation allowance. This new
allowance covers inspection/restoration only; it never resumes or renews the
old study. Atomically claim the case once using a stable exclusive file beside
the fixed original evidence directory, outside that directory. Register its
owner and evidence path before any external tool or mutation after claim. A
second claimant/terminal tombstone must refuse. Do not force-reclaim a stale
claim. Persist a tombstone through frontend loss and any uncertain mutation.

Immediately before uninstall, reconfirm process absence, container identity and
all five hashes. Register possible uninstall/restoration before command issuance.
Uninstall only the exact registered runner bundle on the owned simulator. Verify
canonical final runner and fixture absence. Restore the device's original
Shutdown state, and verify other devices retain their current pre-cleanup states.
Partial/uncertain cleanup stays retained with its explicit resource facts.

On success return `completed / METADATA_RESOURCES_RECONCILED`. New receipts
record the original refusal/invalid stream and unknown historical exit code,
fresh gates, claim, exact commands, final absence and restored state.
`nativeSettlement` stays `unconfirmed`; no production capability is established.
The original result/ledger/archive remain byte-identical. Inspection and apply
are independently recorded; repeated apply cannot remove a later installation.

Tests cover the Interface with independent synthetic approved-case fixtures at
a private data Seam (not a public approval bypass): exact case inspection/apply,
altered/foreign/reference/extra-query receipts, malformed flags, missing success
or class order, PID/group/runner presence, inspection errors, app path/IDs/hash/
symlinks/extra files, deadline, partial mutation, original byte preservation and
one-use claim including a real competing process. Never contact a simulator in
worker tests. Doubles establish policy only.

## Device-wide exclusion

Both `run_study` and reconciliation must hold one device-wide guard before any
external device tool and through final restoration. Use the existing Bridge
lease namespace from `src/device/lease.ts`: Node's temporary directory plus
`jev-ios-bridge-device-locks/<UPPERCASE-UDID>.lock`. Default Python resolution
must address that same namespace. An optional `Configuration.lease_root` is a
test/local-data Seam; live execution uses the default. No production file changes.

Claim with exclusive creation and mode 600. Refuse every preexisting lease,
including malformed, foreign and stale records; research never takes over or
deletes one. Write `pid: null` to represent an owner whose native settlement is
unestablished, and record the actual `hostPID` separately with token, deviceId,
runId, createdAt and evidence path. `src/process.ts` treats an unknown PID as
alive, so existing Bridge consumers keep this claim busy after frontend loss.
This is intentional unknown-owner accounting, not a fabricated living PID.

Persist pending guard ownership before acquisition; keep its token/provenance in
the evidence. Verify the exact token/record before release or device mutation;
replacement, missing/symlinked lease or write/inspection uncertainty retains
ownership. Only this owner's matching claim may be removed.

Normal metadata releases after verified cleanup/restoration; normal pre-native
refusal releases only after its work/restoration is positively complete. Any
retained study keeps the guard, including reference-study success with native
settlement unknown. Reconciliation inspection releases after all of its own
read-only subprocesses settle; it does not adopt or repair the historical run.
Apply holds through all cleanup and final checks, then releases on success;
any uncertain apply retains the guard and one-use case claim.

Tests use real temporary filesystem claims and competing harmless processes.
Demonstrate that the actual TypeScript `DeviceLease.take` refuses the research
unknown-owner record, including after the claiming host exits. Tests of normal
study/reconciliation must use isolated lease roots and prove the guard is held
during tool calls, other calls refuse before device work, retained resources
retain the guard, and success/refusal releases only the matching settled claim.
Document that noncooperating external tools or custom Bridge lease namespaces
are outside this exclusion mechanism. Supervisor operates the device serially.

## 3. Joined execution and evidence

Supervisor independently reviews both changes before live cleanup. Confirm the
inspection-only path first, then invoke apply once if every gate is positive.
Do not bypass a failed gate or substitute a test double for live evidence.

After successful reconciliation, run the already source-bound fixed metadata
build at `/private/tmp/jev-native-owner-study-wire-fix-build` in a fresh evidence
directory. Require its ordinary valid completion/cleanup contract. Only then
run `reference-study` once in another fresh directory on the owned simulator.
That study continues to retain its setup while native settlement is unconfirmed.
Raw observations are evidence, not acceptance of any production ticket.

Archive small immutable receipts, source/product/plan bindings, regression logs,
and a precise report. Independently review Standards and Spec at pinned commits;
fix actionable findings, pass package CI, and merge using matched PR heads.

## Parallel ownership

- Ticket 01 owns changes to `host/study.py`, existing `host/test_study.py`, and
  `host/PROCESS-VERIFICATION.md`.
- Ticket 02 owns new `host/reconcile.py`, `host/test_reconcile.py`, its CLI and
  `host/RECONCILIATION-VERIFICATION.md`. Read the frozen case/spec; do not edit
  ticket 01's files. Root integrates shared helper needs sequentially.
- Ticket 03 owns new `host/device_guard.py`, `host/test_device_guard.py` and
  `host/DEVICE-GUARD-VERIFICATION.md`. Root wires both callers sequentially.
- Supervisor owns spec/case/tickets, README/architecture updates, live operations,
  artifacts and PRs. No worker operates a device, kills a process or publishes.
