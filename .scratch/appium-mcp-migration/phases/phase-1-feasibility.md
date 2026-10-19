# Phase 1 specification: Appium feasibility and native release

Status: owner resumed 2026-10-18; pinned-stack proof selected
Authority: [published spec](../spec.md), Decisions 5 through 8, 13, 20 through 22;
Testing Decisions 5, 7, 18 through 21
Context: [master handoff](../handoff.md), [current native evidence](../phase-1.md)

## Entry and purpose

Resume only on an owner instruction. Read [complete-component research](../research/component-coverage.md)
and [the proof-method decision](../issues/07-complete-coverage-method.md) before changing the draft verifier. Prove the
selected stack can observe, act and stop all owned automation on the private
simulator/emulator. This phase does not build the full production adapter or
change the real admission authority.

The owner selected pinned-stack proof on 2026-10-18. Inherited launch markers and recorded incarnation-bound ancestry supply the earlier ownership evidence. The final scan supplements that evidence. Deliberate self-hiding is an explicit residual risk; ordinary missing identity or incomplete inspection still retains quarantine.

## Work in order

1. Use the owner's pinned-stack proof. Record an inherited run marker and parent chain at launch, bound to process incarnation. Stop recorded owned automation, apply the existing iOS WDA or Android UiAutomator2/settings/forward fence, then perform one bounded post-stop scan by marker, exact device IDs and owned ports. Unknown or unverifiable leftovers retain quarantine. Deliberate marker hiding, raw descriptor/Mach-right transfer and sandbox escape are accepted residual risks outside Phase 1.
2. Test the method with owned host processes before devices. Cover a marker-preserving escaped double fork, legacy/missing launch evidence, unknown or unverifiable leftovers, inspection timeout, and an independent process that stays untouched. Negative cases must retain uncertainty. H05 marker removal, H07 and H08 are excluded. Concurrent creation and authority-ordering races H01–H03, H11, P3 and P4 move to Phase 2 packages 2C and 2D. Phase 1 keeps per-case at-most-one creation, no replay and closure before abort.
3. Diagnose Android lost creation using the existing native-return, inventory,
   source and journal receipts. The latest corrected case created once but
   inventory returned zero where one was required. Explain where the identity
   or lifetime changed. Reconcile only from evidence; zero inventory cannot
   prove that creation never happened. Correct and test the barrier/recovery
   contract without repeating uncertain creation.
4. Repair the host inspection failure, integrate evidence-qualified cleanup,
   review the corrected sources and pass focused host tests. Freeze the source
   revision, selected graph, schemas, WDA/APKs, app build and budgets.
5. Execute the qualifying matrix one case at a time. Review cleanup before
   another case; keep each raw receipt/source snapshot. Finish all required
   cases, then produce the indexed report and two-axis review.

## Logical ownership and cleanup evidence

Persist the following meanings; exact research JSON layout is internal:

| Record | Required contents |
|---|---|
| Run/session binding | Case identity, canonical private device/set, profile/app, exact process incarnation, owned session or explicit unknown creation |
| Component | Incarnation-bound process/service/session identity, owner/run/generation, executable/artifact provenance, ancestry or containment relation, acceptance of future work, verification method |
| Coverage | Root set, observation interval, gaps/permissions/unsupported cases, escaped/reparented identities, completeness result and reasons |
| Command | Unique identity, operation/request binding, authorization before effect, exact attempt count, terminal/pending/uncertain/fenced disposition |
| Closure | Durable closed authority, time/generation, outstanding command set, observed local refusal with unchanged wire/journal counts |
| Fence | Bound component and command set, stop/inertness evidence, one bounded post-stop descendant/session/marker inventory, native verification, artifact hashes |
| Result | Protocol/fault outcome, cleanup failures, retained quarantine/lease, accepted or refused completeness; an uncertain outcome remains inconclusive |

Bind evidence to the exact incarnation and generation. Numeric PID, ppid, pgid
or a listening port alone does not establish ownership. Distinguish an identity
lookup failure from a positively absent component. Marker matches detect
candidates; they do not grant permission to signal a process.

Take ONE bounded post-stop host inventory: walk descendants of every recorded
root using retained ancestry and current parent/session data; inspect commands
naming the private simulator UUID/set, attested Android serial and owned forward
ports. Record scan duration/result and all unverifiable candidates in cleanup.
Classify shared services even when a client launched them: ancestry alone does
not make the shared ADB server disposable. Before a group signal, prove the group
contains no excluded service; otherwise stop only eligible attested members or
retain uncertainty. Preserve foreign work. A timed-out/partial scan retains
quarantine. Preserve enough earlier identity to verify orphaned descendants;
claiming completeness requires more than this final scan.

Verify the platform automation fence while the private device remains running:
iOS stops only its recorded WDA automation; Android stops only its attested
UiAutomator2/settings automation and matching owned forwards. Check native
service/process/input state and IPv4/IPv6 endpoints. Later housekeeping shutdown
of the research pair is not the normal automation fence.

## Qualifying matrix

Execute each row on both private platforms using the reviewed source:

| Case | Required dispatch and result |
|---|---|
| Normal | One creation, valid before XML, one unique-target tap, fresh visible change, validated inline PNG and deletion; complete cleanup and safe subsequent use |
| Lost creation reply | At most one creation, no inferred/replayed ID; reliable owned reconciliation or explicit uncertainty; complete-component fence still required for release proof |
| Lost action reply | One action attempt; inconclusive execution, closed dispatch, no retry, terminal/fenced accounting |
| Cancellation after native dispatch | Durable closure before abort; original operation remains pending/uncertain until terminal or fenced; no new input |
| Late reply | Reply cannot restart dispatch, add input or revise the immutable outcome; observed closed path refuses before wire |
| MCP process failure | Parent death is not cleanup; surviving owned/native work is separately covered and verified; incomplete coverage retains lease/quarantine |

Control before-dispatch cancellation and partial cleanup in host fixtures. Native
cases must show actual native dispatch barriers, not merely an SDK call. A late
or buffered confirmed response must not be labeled a lost reply. Failed parsing
or required cleanup prevents an overall pass even if an action succeeded.

## Stack, parsing and refusal contracts

Retain the frozen candidate manifests and actual-loaded provenance. Validate
server identity/schemas before creation; creation IDs, owned inventory, caps,
XML envelope/platform structure, all-match distinct IDs, completion correlation,
inline screenshot bytes/dimensions, deletion and errors before consuming them.
Keep the measured XML-viewer exclusion and effective gesture defaults in tests.
Malformed/ambiguous/stale/changed required data dispatches no successor input.
Inspect vendor convenience-handler fallback/retry paths as well as client retry
behavior. Count actual native input attempts; one MCP request can conceal more
than one input. Use a bounded no-retry public-core operation when needed, then
qualify that operation in this matrix before relying on it in Phase 3.

Track startup and session-time vendor loads, lock/archive integrities, selected
WDA architecture/hash/signing provenance and actual Android automation APK
hashes. Refuse alternative/latest-cache artifacts before effects. Label earlier
startup-only records as such. Source support and failed simulator signing checks
cannot establish physical-iPhone support.

## Exit and handoff

Require all three conditions, durably evidenced, for every qualifying release
case: closed dispatch; every issued command terminal/fenced; every owned native
component unable to act. Require safe subsequent use and no automatic mutation
replay. Keep unreachable/unverifiable cases quarantined and out of reclaimed
counts. The research journal does not release production ownership.

Publish a GO/NO-GO report linking all 12 cases, selected stack, tested source,
parser/refusal fixtures, command/component records, failures, cleanup and
quarantine/reconciliation evidence. Pass relevant typecheck/host/build checks
and separate Standards/Spec review; do not reuse the previous commit's full
suite as the WIP result. GO is required before Phase 2/full adapter work.

Owner-resolved method: [Complete-coverage mechanism](../issues/07-complete-coverage-method.md).
Source investigation: [Complete owned-automation coverage](../issues/01-complete-automation-coverage.md).
