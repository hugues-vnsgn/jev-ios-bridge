# Preserved adapter round1

This is the original blocked twelve-file freeze at base `1275f93c616c90aba63e92468679cf39f13157b5`. The author report and all original commands, logs, source mappings and diagnostic failures are retained without overwriting them.

`evidence.tar.xz` contains all 409 original private files, including both raw coverage directories. `preservation-xz.json` records each member's SHA256, the archive hash and successful verification of every decompressed member. Seventy files outside the raw coverage directories also appear here directly so report links resolve. The xz archive is 1,836,564 bytes and preserves the same 1,161,222,296 raw evidence bytes.

The first verified gzip archive remains intact in the separate Root-owned repair worktree. `preservation.json` retains its original receipt; `original-gzip-relocation.json` records its current absolute path and unchanged hash. The xz archive supplies the same evidence in this Git tree without a 244 MB blob. No original worker artifact was deleted or altered.

Round1 passes do not accept the adapters. Independent Spec review found two P2 defects; the original exact24 focused run also contains the baseline runtime-warning fixture failure. Packed local-dependency/bin proof remains partial. See the separate independent reviews and Root's `public-adapters-repair-scope.md` for the repair grant. Later round2 evidence must remain separate.
