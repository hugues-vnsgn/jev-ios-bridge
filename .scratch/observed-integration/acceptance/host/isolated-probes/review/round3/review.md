# Root isolated probe runner static closure review: BLOCKED

Source SHA256 `3ac4b56ddb86c9cdaef2e9f6da99b990d071a30f52551283d46505fa88b81a58`; source/snapshot match before/after. Earlier cade6d23 and39414869 reports remain unchanged. No execution or source edits.

## Closed

The one-component label validation and ordinary timeout/error cleanup remain closed. The spawn/publication race is now closed (`:72–92`): while publishing_child is true, SIGINT/SIGTERM only records the signal. Popen returns into the owned child handle before publication ends, then the recorded signal enters outer exception cleanup. The child retains its ordinary signal mask.

## Remaining finding

**P2 — Repeat signal can still skip cleanup during its entry transition** (`:73–77,97–101`). The handler raises every time outside publication, even if received_signal was already recorded. Finally must install two SIG_IGN handlers using a loop; before a signal's ignore handler is installed, a second SIGINT/SIGTERM raises out of finally and skips owned kill/reap/result publication. Thus the stated repeat-interruption protection does not cover the transition into cleanup. This is a static control-flow finding, not an executed race claim.

Suppress raising on any subsequent signal once the first is recorded. This covers the transition into finally as well as the ignore-handler installation without changing first-signal wait interruption or deferred spawn handling. A cleanup-phase flag assigned only after finally begins would leave a pre-assignment window.

No other concrete new blocker identified. Main-child environment, private evidence, finite budgets, exact helper/guard checks and contemporaneous source/runner/raw receipt design retain their previous scope. SIGKILL or unwriteable evidence cannot be guaranteed to produce a receipt; no such runtime behavior was tested. This review does not prove Ticket09/12/native/live acceptance.
