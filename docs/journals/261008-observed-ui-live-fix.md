# Live observed action validation and touch-path fix

The user-selected Orca Codex pane owned simulator operations while the coordinator
inspected evidence and fixed integration. A semantic tap returned success without
activating a SwiftUI NavigationLink on iOS 27.0. Direct AXe reproduced the no-op at
the correct point; the vendor touch-down/up path with a 50ms hold reached Details.

Only experimental tapOnce now uses that single vendor touch request. It refuses
missing capabilities and does not retry. Live ordinary navigation, already-satisfied
without input, controlled host response loss and fresh-process quarantine refusal
passed. Host checks: 965 tests, typecheck and build; two independent reviews clear.

[Verification](../../.scratch/observed-ui/integration/verification.md) records the
scope: response withheld after real acknowledgement, no native settlement claim,
three owned uncertain devices retained, historical study untouched.
