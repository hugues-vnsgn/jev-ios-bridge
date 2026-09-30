# Phase 4: element mapping, and golden tests from the captures

Status: ready-for-agent
Blocked by: none

Spec: [../spec.md](../spec.md), "Phase 4". The work is [the release spec's phase 4](../../android-support/release-spec.md#phase-4-the-android-driver-domain-model-adr-0006-mobilecli-as-a-dependency-how-android-elements-map-onto-the-bridges-elements-how-a-script-names-an-android-app-and-device-actions-across-android-versions-where-android-plugs-into-the-code-items-2-5-6-and-8) item 5, and item 9's golden tests. The rules are the Answer of [How Android elements map onto the bridge's elements](../../android-support/issues/02-android-element-mapping.md). Read them in full. The detail below only adds acceptance criteria.

## What to build

New code goes in `src/device/android/`.

1. **The mapping**, a pure function from the agent's tree (`{hierarchy: [...]}`) to the bridge's `Element[]`. Port `spikes/android/element-mapping.cjs` from the prototype branch at `2366759` (worktree `/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.worktrees/proto-android-mapping`) into TypeScript. Keep its default options, and drop the prototype-only `note` and `source` fields. Don't merge the prototype branch. In short:
   - roles come from the class, or from Compose's role-marker child;
   - a blank button takes its first inner text as its label, and that text stays in Jev's view but gets `selectable: false`;
   - system bars, invisible and zero-size nodes, and layout wrappers are dropped;
   - IDs are full resource-ids; switches are `"1"`/`"0"`; no new roles.
2. **The two additions:**
   - any node with `scrollable: true` is a `scroll-view`, whatever its class, **except** that the text-field rule comes first: a multi-line `EditText` reports `scrollable` and must keep `typeText`;
   - a `password: true` field shows dots of its text's length, never the raw text.
3. **The correction:** keep a text field's text exactly as the device reports it. Don't trim it, and call a field empty only when its text is the empty string (then its hint becomes the `placeholder`). Labels, hints and other text may stay trimmed.
4. **Refs and the screen hash** are the driver's (Issues 13 and 15); the mapping only needs to give each element a stable ref within one capture.

## Golden tests

- Copy the 10 captures (`spikes/android/captures/*.json`, without the PNGs) and the 10 judged texts (`spikes/android/jev-check/observations/*.txt`) from `2366759` into `tests/fixtures/android/`. Name the source commit in the test file.
- For each screen, test three things: the raw tree, then the elements (a **new** golden file, `tests/golden/android-elements.json`), then Jev's text. **`renderAssertionState` over a snapshot of those elements, with `'android'`, must emit each `observations/*.txt` byte for byte.** `cmp-3-number-input.txt` is the version re-checked after the placeholder fix.
- The captures come from `dump ui --format raw`, which has the same node shape as the agent's `device.dump.ui` (the tracer confirmed it) but lacks `scrollable` and `password`. Add small fixtures for those flags from [`api36-lists-direct.json`](../../android-support/findings/05-assets/api36-lists-direct.json) and a hand-made password field.

## Acceptance

- Tests for: a multi-line `EditText` that reports `scrollable` (a text field with `typeText`), a `LazyColumn`-style `View` with `scrollable: true` (a `scroll-view`), a password field (dots, same length, no raw text anywhere in the element), a field holding only spaces (a `value`, not a `placeholder`), and a value with a trailing space (kept exactly).
- The 10 judged texts match byte for byte. No existing golden entry changes; `android-elements.json` is new.
- `npm run check` passes. No device is touched.
