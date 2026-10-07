# Independently bind the next two native studies

The supervisor owns the next-step decision and implementation. The user has
authorized native-provider research, design, delegated implementation and PR
merges. No additional backend choice is required from the user.

## Purpose and chosen shape

The existing simulator reports a deleted historical runner as installed. Keep
that observation, original invalid result, unknown historical exit code and
consumed cleanup claim intact. Prepare two explicitly declared research app
identities on the same owned device: one for metadata, one for reference-study.
This avoids making reference admission reuse a namespace just cleaned up by
metadata. It does not repair the old registration or prove durable absence.

Use one small checked-in declaration consumed by builder and host. Profiles are
selected by the existing closed plan set, not supplied by arbitrary bundle-ID
flags. No allocator, retry-to-new-ID, plugin registry, fallback, shared-daemon
reset, registry deletion or different simulator.

| Plan | Plugin | Runner | Fixture |
| --- | --- | --- | --- |
| metadata | `dev.jev.research.native-owner-20261007-metadata` | `dev.jev.research.native-owner-20261007-metadata.xctrunner` | `dev.jev.research.native-owner-20261007-metadata-fixture` |
| reference-study | `dev.jev.research.native-owner-20261007-reference` | `dev.jev.research.native-owner-20261007-reference.xctrunner` | `dev.jev.research.native-owner-20261007-reference-fixture` |

## Interfaces and binding

Keep `run_study(plan, configuration, dependencies)` and its result model.
Add `Configuration.build_binding: Path | None = None`; ordinary successor
studies require a builder receipt. The CLI accepts `--build-binding` and the
existing `--plan`. Invalid or missing binding refuses before simulator work.
Existing foreign-device/invalid-configuration checks retain their ordering.

Extend the existing builder with `--plan metadata|reference-study`. Build in
fresh directories without operating a device. Record the selected profile,
actual runner/plugin/fixture IDs, every source input including the shared
declaration, generated project/spec settings, every product file and original
test plan. Compare sources before and after building. Preserve source revision,
actual commands and Xcode version. Never expose environment secrets.

Before any simulator command, the study validates the selected plan/profile,
exact bundle identities, full source/product inventories and hashes, original
test-plan identity/hash, allowed target/dependencies, paths and existing strict
environment/argument rules. A binding from the other plan, old/foreign products,
an extra/missing file, symlink, changed source/product/plan or unsupported field
must refuse. Record the verified binding and its digest in fresh evidence.
The receipt is provenance for research, not a trusted production certificate.

## Native agreement

Bind fixture selection through the generated plugin plist/build settings, not
an arbitrary runtime bundle-ID environment value. The native entry point reads
the actual main/plugin bundle IDs and build-bound fixture ID. Emit one bounded
study-identity observation immediately after `started`, using the existing v1
record envelope. Ordinary successor streams require exact agreement before
admitting further observations or recreation callbacks. Historical stream
validation remains usable for the original case, without rewriting its bytes.

Fixture telemetry includes its actual `NSBundle` bundle identifier. Both native
and host readers verify it against the selected profile before app-element
research or recreation. The activation record names that same fixture. Preserve
zero input, telemetry PID/generation/counter checks and the existing ABI,
reference, bounds and admission rules. Unit-test doubles establish policy only.

## Ownership and old context

Retain the owned UDID, runtime/name verification, Bridge-compatible guard,
original monotonic allowance, independent process accounting, strict canonical
absence before installation, metadata completion/cleanup requirements and
reference-study retention. Each new profile checks its own runner and fixture
absence; a positive or uncertain response stops the experiment. No automatic
replacement profile or cleanup replay follows.

Freeze the original runner/plugin/fixture IDs in historical reconciliation and
the old startup diagnostic. They must not inherit new study defaults. Preserve
the exact approved-case bytes/hash, historical source/archive hashes, one-use
tombstone semantics and zero-query exception scope. Original receipts remain
immutable. No production `src/` changes and no accepted production capability.

## Verification through existing Seams

Test through `run_study` and the builder/CLI, which are the already authorized
study Seams. Use isolated claims and process/device doubles in worker tests;
workers never operate a simulator or inspect/kill live processes.

- A legacy dangling registration does not authorize mutation of that identity;
  the metadata profile may proceed only when its two exact absence checks pass.
- Missing, altered and cross-plan binding, runtime identity mismatch, wrong
  fixture telemetry identity, changed products/source/plan and extra startup
  dependency refuse or retain before any disallowed work.
- Valid metadata removes only its newly owned runner, verifies absence and
  restores the initial state/guard. A valid reference stream still retains its
  device/apps/guard while native settlement is unconfirmed.
- Historical reconciliation continues to recognize only original identities
  and refuses the completed claim; the old diagnostic still observes old IDs.

Use failing-before/passing-after evidence for meaningful new behavior, not
mapping constants asserted against themselves. Run host regressions and native
policy tests appropriate to telemetry/record changes. Root runs actual generic
simulator builds, independently reviews Standards and Spec, and lands matched
PR heads after package CI.

## Joined execution owned by supervisor

Only after review, verify both fresh build bindings against their exact source
and products. Run metadata once in a new evidence directory under the ordinary
contract. If completed with cleanup/restoration verified, run reference-study
once using its separate bound profile and another fresh evidence directory.
Reference retains ownership while native settlement is unknown. Never convert
method return, runner exit, missing files or a validity observation into an owner
guarantee. Preserve raw evidence and describe the actual remaining native
requirements in plain language. All 23 production requirements remain pending.
