# Checkpoint feasibility no-go

The owner approved the frozen checkpoint corpus and live evaluation. The testing agent ran tuning and held-out evaluation once each. Full observations with history at a 0.6 Choice threshold scored 17/20 correct top choices and 10/20 accepted on the fresh held-out set. There were no wrong accepted actions, false-pass assertions, or request failures. The required 18/20 correct and 16/20 accepted bar was not met.

The [complete result](../../spikes/feasibility/results-v3/heldout/heldout.md), frozen corpus, approval, source archive, partial journals, and one-run claims are retained. [Ticket 19](../../.scratch/jev-ios-bridge/issues/19-checkpoint-feasibility.md) records the answer. ADR-0001 remains proposed and reopened. [Ticket 20](../../.scratch/jev-ios-bridge/issues/20-post-feasibility-direction.md) presents an explicit-script alternative for owner discussion; it is not an accepted replacement.

Engineering checks passed independently of feasibility: 93 tests, type checking, and build. Report fixes now identify the pending checkpoint after a budget boundary and link completed proofs to their recorded screen evidence. The checkpoint prototype, fixtures, and corpus are on the draft release branch. No product release, merge, or performance claim was made.

The owner transferred the remaining effort from Claude Code. The main agent owns the tracker, docs, and owner discussions; `gpt-6-sol` high agents own coding, builds, and tests. Stale main-checkout claims and the simulator-name config remain untouched until an eventual authorized merge reconciliation. The private key stayed in the original ignored environment file.
