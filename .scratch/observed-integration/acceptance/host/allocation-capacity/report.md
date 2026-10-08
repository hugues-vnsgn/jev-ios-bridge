# Ticket 03 allocation capacity read

Verdict: PASS for the bounded store repair, pending Root's independent review and integration.

Base: `b70a7ab3883dfb1530918f16cc39324b1662f91e`. Worktree: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-observed-allocation-capacity`. Branch: `feat/observed-allocation-capacity`.

Root and allocator dispatch agreed on:

```ts
export type AllocationCapacity = { heldAllocations: number; reservedBytes: number };
Admission.readAllocationCapacity(): AllocationCapacity;
```

The capability reads every durable allocation inside one consistent read transaction. It counts only records with `capacityHeld === true`, including retained and quarantined records, and sums each stored reservation's bytes. Current configuration does not reinterpret existing reservations. Checksums, boolean capacity flags, positive safe-integer reservation bytes and aggregate arithmetic are validated; corrupt/unsafe state throws `AdmissionError` with `STATE_UNAVAILABLE`. No SQL is exposed to allocator/runtime callers.

| Matrix | Expected and observed | Evidence |
| --- | --- | --- |
| All lifecycle states | Preparing, ready, executing, retained and quarantined each contribute 800 bytes; pre-dispatch failure releases its capacity; total 5/4000 | validation-green.log |
| Empty/read invariance | Empty store returns 0/0; repeated reads and reopened reader preserve database bytes | validation-green.log |
| Changed configuration | Retained 800-byte reservation plus new 1200-byte reservation returns 2/2000 despite a later changed duplicate configuration | validation-green.log |
| Corrupt fields/checksum | String/null held flag and negative/zero/fraction/string/unsafe bytes fail closed; checksum failure cannot hide capacity | validation-green.log |
| Arithmetic boundary | Exact MAX_SAFE_INTEGER total succeeds; aggregate overflow fails closed | validation-green.log |
| Blast radius | Existing admission, migration, allocation, fencing and subprocess tests remain passing on both runtimes | node26.log, node24.log |

Raw commands/results:

- `node --import tsx --test --test-name-pattern='allocation capacity includes' tests/admission-allocation.test.ts`: initial red exit 1 (1 failed, missing capability), then green exit 0 (1 passed). Logs `capacity-red.log`, `capacity-green.log`.
- `node --import tsx --test --test-name-pattern='allocation capacity' tests/admission-allocation.test.ts`: validation red exit 1 (3 passed, 8 failed); green exit 0 (11 passed, 0 failed/skipped). Logs `validation-red.log`, `validation-green.log`.
- `node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts`: Node v26.8.1, exit 0, 149 passed, 0 failed/skipped, 23.92 seconds. `node26.log`.
- `npx --yes --package=node@24.0.0 node --import tsx --test tests/admission-core.test.ts tests/admission-migration.test.ts tests/admission-allocation.test.ts`: exact Node v24.0.0, exit 0, 149 passed, 0 failed/skipped, 23.79 seconds. `node24.log`.
- `npm run typecheck`: exit 0, `typecheck.log`.
- `npm run build`: exit 0, `build.log`.
- `git diff --check`: exit 0.

`runtime26.log` and `runtime24.log` record exact runtime versions and process umask 22 (octal 0022); test children inherit that mask. Evidence was created under umask 077: directory 0700, files 0600. Corruption tests deliberately modify only isolated temporary database fixtures; assertions use the Admission interface. No production store, real migration, device/backend, app source or secret access occurred.

Limits: this is an authoritative snapshot, not a disk quota or a new reservation. Allocator must combine these stored outstanding bytes with fresh filesystem metadata at its required second check; later external disk consumption remains outside this capability. No lifecycle, release, guard or admission-write behavior changed. No unrelated full suite was run. Simplify is unavailable; maintainability review and integration remain Root-owned. Evidence remains untracked beside this report.
