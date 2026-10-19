# Android lost-creation cause

The retained `proof-android-lost-create-c-20261013` case did not establish a successful lost creation. Its `native-return.json` records `command-1` with `isError: true`. Nevertheless, the old ledger wrote `fault-barrier.json` for that command and held the error reply. Its `inventory.json` and the client's reconciliation both contain zero sessions. The client then failed its expected-one-session assertion.

The old loss condition checked only fault mode and create operation. It did not require a successful validated owned creation. This concealed a provider setup failure as a lost successful reply. Zero inventory is consistent with that failed provider result. It is not evidence that no native work ever started. The retained receipts do not identify the underlying provider setup error, so that error is not guessed or relabeled as successful creation.

Ported from `243c34e98`, the ledger returns provider errors without a loss barrier. Nominal success must match exactly one owned session in both the reply and public inventory, have public session metadata, and remain in the final inventory before entering the barrier. Closing the journal blocks later creation and mutation without another provider invocation. The tests cover error, malformed success, valid success and invalid or vanished session metadata.

Evidence is retained in Git commit `160870ff3` under `evidence/live-protocol/proof-android-lost-create-c-20261013/`: native-return.json, fault-barrier.json, inventory.json and client.json. No device run was used for diagnosis.
