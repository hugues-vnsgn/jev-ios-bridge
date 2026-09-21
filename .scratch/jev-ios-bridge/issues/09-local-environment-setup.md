# Local environment: API key, XcodeBuildMCP, a booted simulator, a sample app

Type: task
Status: open
Blocked by: 01

## Question

Nothing to decide; the prototype cannot start until these exist on this machine:

- A TypeSafe API key in `TYPESAFE_API_KEY` (env or `.env`). Human obtains it from typesafe.ai.
- XcodeBuildMCP pinned to a known version, with its UI automation backend (AXe) working per the findings of ticket 01, verified by taking a `snapshot-ui` of a booted iOS 26 simulator.
- One booted simulator chosen as the default device and recorded in `.xcodebuildmcp/config.yaml`.
- A sample iOS app with a couple of screens and decent accessibility labels, installed on that simulator, with its bundle id recorded. A tiny SwiftUI app in `examples/` is acceptable.

Resolve by recording what was done, the bundle id, the simulator UDID, and where the key lives.
