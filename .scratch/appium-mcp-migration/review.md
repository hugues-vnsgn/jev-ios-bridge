# Appium MCP migration review

Reviewed on 2026-10-12 against the published [spec](spec.md). Baseline repairs
were reviewed against selected source `0d3e54a9d1d80c1a9188c8c5e5717254e9a95994`;
the discovery work was reviewed against baseline repair commit `f95f4bec8`.
Separate agents performed the Standards and Spec reviews in parallel.

## Standards

Pass, zero remaining findings for the baseline and discovery deliverables.
No documented-standard breaches or meaningful baseline smells remain.
The initial environment-provenance finding was corrected: the probe records
effective and explicit child-environment key names without values. Its
cleanup removes the temporary workspace even if client closure fails.

## Spec

Zero findings for the baseline and staged discovery work. The candidate
lockfile, probe, and evidence agree. Missing-driver evidence is explicit,
and no discovery result is presented as native settlement.

The migration remains incomplete. Testing Decision 21 requires both platform
round trips, fault cases, quarantine/reconciliation, and native cleanup
evidence. Decision 8 requires loaded-stack proof and WDA artifact provenance.
Those requirements are pending and block production integration, as recorded
in the [Phase 1 report](phase-1.md).

Remaining findings: Standards 0; Spec 0 for the reviewed deliverables.
Full-spec completion is blocked at Phase 1; phases 2 through 4 remain pending.

## Dedicated-device discovery review, 2026-10-13

Two agents reviewed the staged device preparation, disposable experiments,
evidence, and reports against `45a843bfcc63fe0ea789fd8ff54571e428afba74`.
The current scope follows the owner's instruction to select devices while
avoiding the device another agent uses.

### Standards

Pass, zero remaining findings. The unsupported Android instrumentation query
initially appeared to establish absence. Historical receipts now mark that
query unsupported and instrumentation state unverified. The corrected helper
requires the supported process-dump header and makes no instrumentation
absence claim.

The report discloses the settings-service restart after force-stop. The new
stop receipt records disabling only the dedicated emulator's three Appium
packages, their disabled state, subsequent process absence, no owned forwards,
and closed ports. It retains `gatePassed: false` and `leaseReleased: false`.
Archived source hashes match the summary. WDA signature and strict-verification
failures remain disclosed.

### Spec

Zero findings for device selection and live discovery. No device-isolation
breach, scope creep, or unsupported gate-pass claim was found. The report
distinguishes historical observations from the stronger follow-up receipt.

Full Phase 1 remains incomplete. Testing Decision 21 requires clean normal
runs, complete protocol/refusal validation, and complete fault acceptance.
Decision 20 still needs component identity, host-child inventory, bounded
recovery, authoritative reconciliation, and safe reacquisition proof.
Decision 8 still needs complete actual-loaded stack provenance and controlled
alternate-WDA refusal. Production integration remains stopped.

Final discovery findings: Standards 0; Spec 0. These verdicts cover the
reviewed discovery deliverable, not completion of the migration spec.

Final host verification passed: `npm run check` completed typechecking,
2,258 tests with no failures or skips, and the build. Experiment-source and
PNG hashes, JavaScript/Python syntax, evidence JSON, retained uncertainty
records, copied published documents, and report links also passed checks.
These checks do not replace the outstanding native feasibility evidence.

## Stop/restart review, 2026-10-13

Two agents reviewed the staged stop/recovery work against `2fcef41ee`.
The owner approved interrupting a run and checking stop/restart behavior on
the existing private pair. The reviewed deliverable remains a Phase 1
experiment, with production integration stopped.

### Standards

Zero documented-standard breaches and zero meaningful baseline smells.
One report-accuracy finding was corrected: the implementation table now says
live discovery was recorded and the four stop/restart checks passed. It no
longer implies the earlier screenshot-failing experiments passed end to end.

The fixed device identities, precise process incarnations, and exact forward
mappings bound native mutations. No credential forwarding, foreign-device
mutation, or shared-service shutdown was found. Current and historical source
hashes, receipt hashes, and all 48 shutdown samples match the reports.

### Spec

Zero findings for the approved scoped experiment. All four final cases use
the same corrected source, issue one creation and one long press, close
dispatch before interruption, stop the owned group and private device, and
refuse the old action and new creation from a fresh MCP process. Outcomes
stay inconclusive; quarantine remains retained; no lease is released.

Full requirements remain pending. Testing Decision 21 still needs complete
protocol/fault contracts and the full feasibility matrix. Decision 20 still
needs complete component and escaped-child inventory. Authoritative
production quarantine, reconciliation, and safe reacquisition remain pending,
as do Decision 8's complete loaded-stack and alternate-artifact contracts.
The research journal remains separate from admission authority.

The reviewers read the final check log: typechecking, 2,263 tests without
failures or skips, and build passed. The alternate emulator matches its frozen
hash; the installed SDK remains unchanged.

Final scoped findings: Standards 0 after the wording correction; Spec 0.
Neither verdict represents completion of Phase 1 or the migration.

## Protocol, loaded stack, and competing iOS admission

Fixed point: `5e0f58a04e6ef4e57b6b93564f1b772de791cc9c`.
Scope: staged research sources, pinned fixtures, host tests, and evidence;
no production adapter, dependency, or authority changes.

### Standards

Zero outstanding findings; no documented breaches or meaningful baseline
smells. The malformed-PNG finding was reproduced and corrected. The tracer
now refuses palettes and malformed type bytes and requires complete
compressed-stream consumption. Controlled provider cases prove those
refusals while the recorded RGB/RGBA screenshots still pass.

XML limits and entity refusal, explicit identities, no mutation retries,
filtered errors, and isolated iOS admission exclusion match the report.
Startup provenance matches the frozen fixture. Both private devices remain
off with closed ports. The final full check covers the corrected parser;
its result is recorded in the linked evidence.

### Spec

Zero scoped findings. Version, schema, and stack mismatches stop before
creation. Malformed consumed tracer replies stop further work. Two processes
use the existing iOS admission module in an isolated fake store; only one
reaches the controlled provider and quarantine remains retained.

Remaining full-spec gates are not completed by these host proofs. Decisions
6 and 8 still require complete action/mode result contracts, live extension
validation, and the complete session-time stack. Decision 18 still requires
Android canonical identity and the offline admission migration. Testing
Decision 21 still requires complete native component accounting,
authoritative recovery, fault acceptance, and the release predicate.
The creation hook is explicitly not live-proven.

Summary: Standards 0 open findings; Spec 0 scoped findings. See the
[protocol report](phase-1-protocol.md) and
[final evidence](evidence/protocol/summary.json).
