# Installed Cryptex runtime implementation

Status: fixture and first-slice regression preparation; tests and production source edits await the Root validation window.

## Authority and ownership

Use exact base 38aa879c3954c9d7742ef04059cad4d2fc824c87 and the approved v3 proposal recorded in base-binding.json. Preserve all 438 protected candidate files. Write only allocation-config.ts, the two new Cryptex test/fixture files, and this private evidence directory. Preserve the shipped parser, fixed Xcode 128 KiB budget and public interfaces. Root assigns independent implementation reviewers.

## Approved seams and TDD

Test verifyInstalledCompatibility and allocationSourceProcess through their existing interfaces. Prepare two observed-layout regressions first; observe genuine failures on verified Node 26.8.1 and exact 24.0.0 before modifying Source. Add later negative cases one vertical slice at a time, retaining their original assertions and raw failures.

| Slice | Input | Required outcome | Evidence |
| --- | --- | --- | --- |
| Compatibility red | Exact approved namespace, read-only mount and iOS 27.0/build24A434 bundle with group-write modes | Exact compatibility proof; no create | First new test, both Nodes |
| Process red | Same Cryptex target with fixed diskutil/plutil and sanitized environment | Authorized bounded conversion with fresh mount checks; no create | Second new test, both Nodes |
| Namespace/path rejection | Wrong owner/group/mode/type/symlink, path aliases, special bits, links, input size | Refusal before unsafe read/child | Later new cases |
| Mount freshness | Writable/mismatched/malformed output, nested device, pre/post metadata or ancestry mutation | Refusal without compatibility/create | Later new cases |
| Aggregate bounds | Listing1001, mounts65, devices1001, total runtimes1001, children8193 | Refusal at the boundary | Later new cases |
| Process uncertainty | Aborted signal, output overflow, deadline, ignored SIGTERM, delayed close/error | Escalation for diskutil only; actual-close tracking; no success | Later new cases |
| Identity | Missing or duplicate explicit IDs across supported roots | Refusal, no inferred version/fallback | Later new cases |
| Preserved behavior | Existing default/Volumes layouts, Xcode budget/parser and create semantics | Existing assertions remain strict | Focused and actual default gates |

## Implementation

Keep private Cryptex parsing/snapshots/mount proof/discovery helpers in allocation-config.ts. Bootstrap diskutil independently of runtime verification and consume parseReadonlyMountMetadata. Require complete identity snapshots including gid and every specified field. Confirm every descendant/opened/final leaf shares the mount device. Installed Cryptex classification overrides artifact-root exceptions. Mint fresh proof before and after conversion; discard it after use.

Count actual launches in the per-preparation production closure, including nested mount queries, and caller-visible dispatches for injected sources. Enforce all v3 bounds and shared cancellation. Add <=10s/64KiB diskutil only, SIGTERM then bounded SIGKILL, preserving the underlying pending promise until actual close and retaining existing create behavior.

## Validation handoff

Root first grants private locked npmci and the red/focused/typecheck/build window. Run normal test children with umask022 and preserve evidence with umask077. After genuine reds, implement the first slice and then successive negatives. Freeze exact Source/test/compiled hashes and raw commands. Request the later actual default-gate window; do not overlap other workers. Live entry remains unverified.
