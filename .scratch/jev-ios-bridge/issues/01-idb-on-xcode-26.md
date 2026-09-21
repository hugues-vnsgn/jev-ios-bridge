# idb as the simulator perception and action layer on Xcode 26

Type: research
Status: open
Blocked by: none

## Question

Does Meta's `idb` (idb_companion via Homebrew, `fb-idb` via pip) install and work against Xcode 26.4 and iOS 26 simulators on this machine, and what exactly does it give the bridge?

Establish, with commands run locally where possible:

- Install path and versions that work today. Note any Xcode 26 breakage and workarounds.
- The JSON shape of `idb ui describe-all` (and `describe-point`): fields per element, whether frames, labels, values, traits, and enabled state are present, and how deep the hierarchy nests.
- The action commands: `idb ui tap`, `swipe`, `text`, `key`, and `idb screenshot`. Coordinate space (points vs pixels) and how it relates to frames in the tree.
- Launch and lifecycle: `idb launch`, `terminate`, `install`, and whether `idb` needs a booted target or can boot one.
- Rough latency of one observe cycle (describe-all plus screenshot) on a booted simulator.
- Alternatives if `idb` is not viable on Xcode 26: `xcrun simctl` alone (no tree), an XCUITest runner app, or the accessibility inspector CLI.

Write the findings to `docs/research/idb-on-xcode-26.md` on branch `research/idb-on-xcode-26`.
