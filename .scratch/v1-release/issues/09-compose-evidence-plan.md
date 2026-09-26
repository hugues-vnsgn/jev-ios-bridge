# Compose app evidence plan

Type: grilling
Status: resolved
Claimed by: Claude Code (owner session)
Blocked by: 04, 05, 11

## Question

Which Compose Multiplatform app and scripts must pass before 1.0, and what counts as passing? Given the candidates and capture findings from "Compose Multiplatform on iOS through MobileBuildMCP", decide:

- the app (fixture or third party) and how Codex builds and installs it reproducibly;
- the scripts: how many, which flows (navigation, list, form entry, a planted failure), and the expected verdict for each;
- whether any bridge change is required for Compose (selector fields, capture mode), or only guide content;
- what result blocks 1.0 and what becomes a documented limit.

## Answer

Decided with the owner on 2026-09-25, from "Compose Multiplatform on iOS through MobileBuildMCP", "Product assessment", and "Live Compose capture". Two read-only surveys shaped the app choice: `~/Codes/Mobiles/openfreightone` was rejected because its iOS UI is native SwiftUI (Compose runs only on Android), and `~/Codes/Mobiles/BFSOne_Mobile_App` was chosen.

1. **App: `BFSOne_Mobile_App`**, a real Compose Multiplatform 1.9.0 app (a SwiftUI shell around one `ComposeUIViewController`, bundle ID `com.beelogistics.BFSOne`). As it stands, every screen past login talks to the production server `api.beelogistics.com` and login writes to it, so the evidence runs its **Design System gallery** (`OFGalleryScreen`) through a debug-only shortcut. The owner adds the shortcut in a BFSOne PR ("BFSOne evidence shortcut"). It must:
   - work in Debug builds only;
   - on launch argument `-of-evidence-gallery`, open the gallery directly, skipping the splash server check, login, the DB-list call, the notification request, and FCM registration (Firebase may still configure);
   - make **no request to `api.beelogistics.com`**, which the release check confirms from the app's debug network log;
   - share the `iosApp` scheme, so a clean checkout builds.
2. **Build:** Codex builds a clean checkout of the pinned BFSOne commit that contains the merged PR, never the owner's working checkout. It builds through MobileBuildMCP (workspace `iosApp/iosApp.xcworkspace`, scheme `iosApp`) and records the commit and the Compose Multiplatform version in the evidence. No upgrade. The guide says "tested on 1.9.0 (and on 1.11.1 in the capture study), 1.12.1 or later recommended".
3. **Bridge changes for this plan:**
   - **Add optional `app.launchArgs`** (array of strings) to the script format. It is passed to MobileBuildMCP `simulator launch-app --launch-args` and recorded in `run.jsonl` and `report.json`. An optional field is a 1.x-compatible addition under ADR-0005, and the guide documents it for any app with a debug entry point.
   - **Reject `value: ''` in the schema** (the review's second option), and correct `docs/usage.md` and `/test-ios`. Treating an absent value as `''` would work for Compose (empty fields omit `value`) but not for native fields (an empty `UITextField` reports its placeholder), so emptiness isn't selectable.
   - Nothing else is Compose-specific. The remaining lessons are guide content: select buttons by identifier or role plus label, put tags on the node that acts, don't assert emptiness through `value`, and handle component-level identifiers that repeat per instance (`numberInput.field`, `of-field-clear`, `of-dot`) without asking the library to change before 1.0.
4. **Scripts:** six, each launched with `-of-evidence-gallery` and run once on the final release candidate after tuning. They are kept as release evidence in `spikes/benchmarks/scenarios/compose-bfsone-*.json`, not shipped. "Developer guide outline" decides whether a trimmed copy becomes the guide's Compose example.

   | # | Flow | Expected verdict |
   | --- | --- | --- |
   | 1 | Scroll to the selection controls, tick "Issue Invoice", select the "Your manager" radio, checkpoint both states | passed |
   | 2 | Type into the "Reason" field (placeholder "Enter reason"), replace the text, checkpoint the new text | passed |
   | 3 | Enter a number in the §14 `OFNumberField` with its keypad, checkpoint the formatted value | passed |
   | 4 | Scroll far down, open the `OFDialog`, checkpoint, close; open the `OFBottomSheet`, checkpoint, close | passed |
   | 5 | Planted false claim in a checkpoint | failed (tests ADR-0004 precedence) |
   | 6 | Planted label-only guard on a button such as "Filled" | inconclusive, `GUARD_AMBIGUOUS`. If BFSOne buttons don't repeat their label on a text child, use a repeated tag such as `of-field-clear` instead. |

5. **What blocks 1.0 (go condition 4):**
   - **Any verdict other than the expected one blocks 1.0** until fixed. If the fix is to a script, Codex records why and runs it once more.
   - **If the cause lies in MobileBuildMCP, Compose Multiplatform, or BFSOne**, including an app crash, Codex stops and the owner decides whether it blocks 1.0 or becomes a documented limit.
   - **A request to `api.beelogistics.com`** in any run's app log also blocks 1.0.
6. **Fallback:** if the BFSOne PR isn't merged when Codex reaches this gate, Codex runs five scripts against `~/Codes/cmp` instead (built in place, source-tree hash and CMP 1.11.1 recorded, no source edits), and the guide says which app the evidence used. Each script first waits up to 60 s for the "done (or idle)" text:

   | # | Flow | Expected verdict |
   | --- | --- | --- |
   | 1 | Dialogs: outer and nested full-screen modal | passed |
   | 2 | Text entry: type and replace in `imeField` | passed |
   | 3 | Number entry: select the `ofnumpad` amount field by identifier plus starting value, enter digits on the keypad | passed |
   | 4 | Planted false claim | failed |
   | 5 | Label-only guard on "Close outer" | inconclusive |

7. **Not covered, and stated as "not tested" in the guide:** `heading()` (BFSOne has none), SwiftUI navigation or tab chrome around Compose, and `usingNativeTextInput`. BFSOne covers checkboxes, radio buttons, list scrolling, placeholders, and dialogs, which `cmp` lacked.

## Comments

- 2026-09-26, phase 5 authoring, on BFSOne commit `2b03477` (the owner's `-of-evidence-gallery` branch, built in a temporary clone): **two planned flows can't produce evidence Jev can see, so they were adapted.** BFSOne's `OFCheckbox` and `OFRadio` expose no checked or selected state to accessibility; they capture as plain buttons. Its `OFTextField` "Reason" has no label or identifier, so it can't be selected among the other text fields. The scripts keep each flow's intent with controls whose state is printed:
  - **Selection:** the "Dark mode" checkbox, whose label flips OFF→ON (`compose-bfsone-toggle.json`). Radio coverage is lost and becomes a documented "not tested".
  - **Text entry:** the tagged `of-picker-search` field, which filters the units list to "Container 20'" and "Container 40'" (`compose-bfsone-text.json`).
  - **Unchanged in intent:** number entry (Quantity = 42 through the keypad), dialog plus bottom sheet (8 swipes down the gallery), the planted false claim, and the planted ambiguous guard (`{label: "Disabled"}` matches a text field and a radio).

  Trial runs: all six gave their expected verdicts, after rewording two claims to name printed text instead of widget meaning or history. The guide should teach this: components need accessibility state semantics, and claims should name printed text.
- 2026-09-26, `cmp` fallback trial: four of five gave their expected verdicts. The number run hit Compose Multiplatform 1.11.1's stale-accessibility-element crash (`EXC_BAD_ACCESS` in `AccessibilityElement.<get-node>`) while the bridge polled through the perf harness's 1M-row dialogs. Summary: `spikes/benchmarks/results/v1.0.0/compose-cmp-crash/`. The bridge now reports such runs as `APP_EXITED`. Per item 5, a crash in the phase 7 runs goes to the owner.
