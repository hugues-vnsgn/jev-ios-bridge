# Phase 4: element mapping, and golden tests from the captures

Status: closed
Closed: Merged into agent/android-v1.2-phase4 at 4cd6661
Claimed by: claude-issue-12
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

## Comments

**claude-issue-12, 2026-09-30.** Built on `agent/android-v1.2-phase4-issue-12`: 45a58fe (mapping and goldens) and 9242b91 (review fixes). `npm run check` passes at 9242b91: 272 of 272 tests, then a clean build. No device was touched.

- **What's built:** `src/device/android/mapping.ts` exports `mapAndroidTree({hierarchy})` → `Element[]`, plus the node types `AndroidNode` and `AndroidTree`. It is a TypeScript port of `element-mapping.cjs` at `2366759`, without `note` and `source`. It adds the two additions: `scrollable: true` gives a `scroll-view` right after the text-field rule, and a `password: true` field shows dots. It applies the correction: a field's text is never trimmed, and a field is empty only when its text is `""`. Refs are `e1`, `e2` and so on in tree order, including the numbers of dropped nodes, as in the prototype. They are stable within a capture.
- **Goldens:** the 10 captures and 10 judged texts were copied byte for byte from `2366759` into `tests/fixtures/android/captures/` and `observations/`. `renderAssertionState(…, 'android')` emits all 10 judged texts byte for byte. The new `tests/golden/android-elements.json` equals the prototype's own output on all 10 screens, with `note`/`source` removed; I checked this once against the prototype worktree. No existing golden entry changed.
- **Flag fixtures:** `api36-lists-scrollable.json` holds the three scrollable nodes (`list.lazy`, `list.row`, `list.column`) copied from `api36-lists-direct.json`. `text-fields.json` is hand-made: a multi-line scrollable `EditText`, a password field, a spaces-only field, a trailing-space value and an empty field.
- **Tests added (`tests/android-mapping.test.ts`, 30):** raw tree shape and judged text for each screen (20); the elements golden; a scrollable `View` becomes a scroll view; a multi-line scrollable `EditText` keeps `typeText`; password dots with no raw text anywhere; a password node's text never becomes a label; spaces-only value, not placeholder; trailing space kept; an empty field's hint becomes the placeholder; refs are unique and stable; one dot per UTF-16 unit. I reverted each new rule to the prototype's behaviour one at a time, and each reversion turned its test red.
- **Deviations, all small:**
  - The prototype's default options are hard-coded; the options object is gone, and the output is the same.
  - As a defensive measure, a password node's text is never used as a label, and a lifted label stops at password nodes and at `AutoCompleteTextView`. No golden changes.
  - A whitespace-only hint now counts as no hint for hiding the drawn-in placeholder text. The prototype checked the untrimmed hint.
  - Password dots are `text.length`, one per UTF-16 unit, as Android's `PasswordTransformationMethod` draws them. So an emoji shows two dots.
- **Not reproducible:** the Answer's "Settings main list 56 raw elements become 25" doesn't match the prototype at `2366759`, which gives 46 elements for that capture (35 selectable). The figure predates the owner's "keep lifted text for Jev" choice. So there is no count test; the golden pins the exact output instead.
- **Left to later Issues:** `run.jsonl` masking a trailing-space value (Issues 15 and 16); the driver's refs and screen hash (Issues 13 and 15).
- **Open-point defaults used:** 4 (`selectable: false` for lifted text) and 11 (a password field's shown value is the mapping's dots).
- **Seen, not acted on:** in `api36-fields-uia.xml`, an empty classic `EditText` reports its hint as its `text` ("Classic password"). If the agent's tree does the same, an empty classic password field would show dots for its hint's length, and an empty classic plain field would show its hint as its value. The captures' Compose fields don't do this. It's worth a look when Issue 14 records real agent output.
