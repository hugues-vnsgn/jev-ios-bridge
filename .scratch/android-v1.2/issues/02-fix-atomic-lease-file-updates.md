# Fix: atomic lease file updates (PR #26 review)

Status: ready-for-agent

Spec: [../spec.md](../spec.md). This fixes a finding from GPT-6-Astra's review of PR #26 (phase 2) on the feature branch `agent/android-v1.2`.

## Findings

1. **P2, `src/device/lease.ts:225-231` (`rewrite()`, called by `own()` and `disown()`).** `writeFile(file.path, …)` empties the lease file before writing its replacement. If the process is interrupted between the two (a crash, `kill -9`, a full disk), the file is left empty or partial. It then loses the holder's `pid` and the owned-process record, which crash takeover needs. The next run can't read an owner, treats it as unknown (never assumed dead), and refuses the device with `DEVICE_BUSY` forever. The reviewer confirmed this with an injected write interruption.

   **Fix:**
   - write the new contents to a private temporary file in the same folder (mode 0600), then `rename` it over the lease file, so the path always holds either the old record or the new one, never an empty file;
   - serialize concurrent `own()` and `disown()` calls on one lease, so their updates can't interleave;
   - clean up the temporary file if the write fails;
   - keep release's token check working against the renamed file;
   - make sure a 1.1 bridge ignores the temporary file: it only opens `<ID>.lock`, but give the temporary file a name that never ends in `.lock`.

   Add a regression test that interrupts the write, for example with an injected writer that fails after the temporary file is created. After it, the lease file still holds the previous complete record, and a dead holder's lease can still be taken over.

## Acceptance

- Every existing test and every file in `tests/golden/` passes unchanged, including phase 2's new tests.
- iOS behaviour and messages are unchanged. iOS doesn't call `own()` or `disown()` today.
- `npm run check` passes.
