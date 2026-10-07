# Independent checks

## Implementation

Reviewed head: `f045d66ed2d10962b7c06839c0ad22fc884bfcb6`.
Base: `8f969d961c383331ba2b0014e59cf12fe902a359`.
Merge: `61ddbbb5125a7de851d71df3a6a30a0b516d6803` in PR 50.

`design_flexible` performed Standards review, excluding its own design note.
Documented standards passed. The optional repeated plist identity mapping in
builder and host was nonblocking and deferred.

`native_provider_extension` performed Spec review, excluding its own research
note. Two findings were fixed: nested README/.gitignore resources escaped source
inventory, and CLI resolution hid a symlink before validation. The reviewer
independently reran four focused public regressions, verified both real generic
build bindings and returned PASS with both findings resolved and no new finding.

Both reviewers inspected final 107-host, 27-native-policy and two historical
caller gates, meaningful red/green logs and actual generic builds. CI passed
both checks at the reviewed head. The supervisor merged that exact head.

## Saved live receipts

`native_provider_extension` independently audited the completed metadata and
retained reference calls. It operated no simulator, inspected no live process,
and read no retained fixture container.

Metadata audit passed: exact binding, schema-valid identity-first stream, real
boolean flags, zero explicit queries/input, class/process completion, all 13
command receipts and raw bytes, positive runner PID absence, canonical app
absence, sole selected-runner uninstall, all 23 initial/final states equal,
Shutdown restored and guard released.

Reference audit passed: exact binding, eight schema-valid records, correct
runtime/fixture identities and stable PID/generation/counter through activation,
first point failure, failed native finish, one explicit query, zero input, all
11 command receipts and raw bytes, class/process completion kept separate from
native failure, no reference/parent/recreation, no cleanup, and the retained
unknown-owner guard matching its on-disk record.

Historical baseline hashes, both complete old archives including decompressed
raw hashes, and 29 original critical receipts were unchanged. The consumed
case remains completed. The reviewer explicitly left exception cause, native
settlement, ancestry, lifetime, independent associations and input guarantees
unestablished.
