# Experimental observed iOS actions

User decision: keep apps unmodified, verify visible outcomes and report uncertain actions honestly. The external native-provider route is unavailable.

## Contract

A new standalone experimental runner uses the existing pinned MobileBuildMCP device driver. It claims the explicit device durably before preparation, captures fresh evidence, checks authored before/after guards, resolves exactly one raw eligible target, submits at most one bridge tap request, and polls read-only observations after device-layer acknowledgement. A visible postcondition is evidence of observed state, not causal proof or a native contact receipt. An already satisfied postcondition sends no tap.

No retries after attempted submission, including vendor stale-reference errors. Cancellation, lost acknowledgement, deadline or evidence persistence failure terminates inconclusively; durable device quarantine blocks successor experimental attempts. Crashed/incomplete records are never reclaimed by PID or time. This journal coordinates this experimental runner only; other tools must not use its device.

Old native production tickets are not accepted by this new contract. Legacy version 1/2 schemas, driver retry behavior and Jev verdict rules remain unchanged. No Jev API key is needed for deterministic guards. First scope is harmless navigation on an already booted dedicated simulator with an installed unmodified app. No device provisioning, deletion or native release assertion is part of this slice.

## Architecture decision

Invert the blocked assumption: automation needs visible outcome evidence, not a complete original native object chain. The module hides capture, strict selection, single submission, bounded polling and attempt recording behind runObservedTap. Reuse MobileBuildMCP rather than introducing Appium/XCTest transport and signing work. Apple exposes element taps and waiting, but those do not replace missing settlement guarantees: https://developer.apple.com/documentation/xcuiautomation/xcuielement

ADR-0002 remains the device-layer choice; ADR-0007's point tap is not used. This new experimental outcome deliberately does not claim the glossary's strong Device lease release invariant: quarantine is additional admission protection, not a settlement certificate.

## Verification

Meaningful tests: zero tap for already-satisfied/ambiguous/truncated evidence; one for observed success/delayed result; no reissue on stale or lost acknowledgement; total deadline/cancellation; durable restart refusal/concurrent admission/write failure; runnable CLI input validation and evidence. Existing driver tests and TypeScript checks must pass. Real simulator validation remains a separate evidence gate; offline tests are never native proof.
