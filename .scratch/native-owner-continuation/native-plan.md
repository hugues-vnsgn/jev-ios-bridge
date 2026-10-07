# Implement stronger native reference observations

Status: implementation, offline verification and supervisor integration review complete
Base: b0bdd34

1. Add a regression at `ObservationStudy.run` showing a nonnil validity reply containing false must preserve false and the requested-key evidence. Observe red, then implement fixed attribute acquisition and bounded scalar/error recording.
2. Add a regression for a nil-parent chain lacking independent root corroboration. Implement independently acquired PID-root observation and native equality with explicit walk termination. Test equal-root, unequal same-PID, fresh-wrapper cycles, missing root, ABI/provenance failures and bounds.
3. Test through the existing macOS `NativeOwnerPolicyTests` scheme. Serialize real native records and run the actual host parser; build both generic simulator profiles without test execution.
4. Run the do-test acceptance matrix, preserve logs and source-bound evidence, then request supervisor integration review before commit.

Native owns `ObservationStudy.{h,m}`, `ObservationStudyTests.m`, `NativeOwnerStudy.m`, `NativeProvenance.{h,m}`, a fixed `ReferenceAccess.{h,m}` helper, project source registration and native README. Host changes remain with the parallel host agent.

The helper hides fixed symbol/class discovery and method provenance. The study retains invocation admission/accounting and the actual object traversal. No public IDB facade or always-unknown production capability is added. These observations pursue IDB ownership prerequisites; owner scope/non-reuse and ancestry non-omission remain separate acceptance requirements.
