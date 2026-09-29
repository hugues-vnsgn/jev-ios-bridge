# Findings: actions across Android versions (ticket 05)

Measured 2026-09-28/29 on two emulators, through `mobilecli` 1.0.14 and `adb`:

- **Android 12 (API 31):** new AVD `jev-actions-api31` (`system-images;android-31;google_apis;arm64-v8a`, Pixel 6 profile, 4 GB data partition, no sd card), serial `emulator-5560`.
- **Android 16 (API 36):** `Medium_Phone_API_36.1`, serial `emulator-5554`, used after `06-log-pane.md` said `EMULATOR RELEASED`. Its quickboot snapshot was not saved, so the installs are gone.

No phone was ever on the adb server. Every command ran on a private adb server (`adb -P 5099 --one-device NO_SUCH_USB_DEVICE start-server`, `ANDROID_ADB_SERVER_PORT=5099`), and each mobilecli call first checked that `adb -P 5099 devices` listed only `emulator-*` serials. mobilecli ran with `--insecure-storage` and the sandbox env from the ticket (`05-assets/env.sh`).

**Test apps:**

- **Twin app:** `dev.jevbridge.diagnostic`, the Android twin of the diagnostic app.
- **Settings:** its search field is a classic `EditText` in `com.google.android.settings.intelligence`.
- **Probe app:** a throwaway Compose app I built for this ticket, `dev.jevbridge.actionsprobe` (sources in `05-assets/probe-app/`). It uses the same Compose Multiplatform 1.11.1 artifacts as the twin. It has:
  - text fields: plain, password, a phone field that formats digits as `(555) 123-4567`, a field that uppercases what you type, and two classic `EditText`s, one plain and one password;
  - lists: `LazyColumn`, `LazyRow`, and `Column.verticalScroll`, with an on-screen echo of their scroll positions;
  - animations: an 800 ms slide-in panel, a counter that runs 0→100 over 1500 ms, and an endless spinner.

  Each field shows its real value in a text below it (`[value]`), so exactness is read from the screen itself.

I didn't install the owner's cmp app, because it wasn't on either emulator.

The scripts and raw results (one JSON line per measurement) are in `05-assets/`: `text_tests.py`, `replace_repeat*.py`, `settings_search.py`, `tap_swipe.py`, `settle.py`, `probe.py`, and the `api31-*` and `api36-*` result files.

## Summary

1. **Replace text.**
   - `input keycombination` exists on Android 12, but it drops the Ctrl key: `adb shell input keycombination 113 29` types a literal `a`.
   - mobilecli's own `io keys ctrl+a` does work on both versions. It runs through mobilecli's on-device agent, and that agent sets the Ctrl modifier properly.
   - **Clear with `io keys ctrl+a`, then a separate `io keys backspace`, then `io text`.**
   - Never send `ctrl+a backspace` in one call: on Compose fields, the backspace often lands before the selection does.
2. **Tap.** Tap the element's centre by coordinates.
   - Speed: 0.011–0.024 s per tap, against 0.12–0.20 s by ref.
   - Refs only exist in mobilecli's other dump format, and they are positions in the tree, so a stale ref silently taps a different element.
3. **Swipe.** Swipes inside an element's bounds scroll Compose lists correctly in every direction.
   - Compose lists *do* carry `scrollable=true`: in raw `uiautomator` XML, and in mobilecli's own on-device agent.
   - mobilecli's Go side throws the flag away when it re-encodes the tree. The same happens to `password`.
   - A four-field change upstream would fix it. Meanwhile, the bridge can read the agent directly over the `adb forward` that mobilecli already opens.
4. **Typing speed.** The spike's 4.8 s for 17 characters doesn't reproduce on 1.0.14.
   - 17 characters: 0.09–0.28 s with `io text`.
   - 100 characters: `io text` 1.2–3.1 s, `adb shell input text` 1.3–2.1 s.
   - Setting the clipboard and pasting takes 0.06–0.12 s at any length.
   - Non-ASCII text (`café`, `Tiếng Việt`, `日本`) already types exactly, because mobilecli pastes it through the clipboard.
5. **After an action.**
   - The first capture after an action always takes about 0.55–0.72 s, because mobilecli waits for 500 ms of accessibility quiet.
   - That capture can still be mid-animation, mid-fling, or even blank during an activity switch.
   - Rule: **capture until two captures taken at least 250 ms apart match (status bar excluded), capped at 3 s.** In 24 scenario runs it never settled falsely. Comparing back-to-back captures settled falsely 3 times.
   - Turning animations off shortens the wait but doesn't remove the need for the rule.

## 1. Replace text

### Which "clear the field" methods work

Each method ran on a field holding `old value 123`, and the field was read in the next capture. The last column counts how often the field ended up empty.

| Method (command) | API 31 Compose field | API 31 classic `EditText` | API 36 Compose field | API 36 classic `EditText` |
| --- | --- | --- | --- | --- |
| `mobilecli io keys --device D ctrl+a` then `mobilecli io keys --device D backspace` (two calls) | 5/5 and 10/10 | 5/5 | 4/5 and 10/10 | 5/5 |
| the same with a 0.2 s pause between the two calls | 10/10 | – | 10/10 | – |
| `mobilecli io keys --device D ctrl+a backspace` (one call) | **0/5** | 5/5 | 4/5, and 1/4 in a manual check | 5/5 |
| `mobilecli io keys --device D end backspace ×20` (one call) | 10/10 | – | 10/10 | – |
| `adb shell input keyevent KEYCODE_MOVE_END KEYCODE_DEL ×40` (one call) | 5/5 and 10/10 | 5/5 | 5/5 and 10/10 | 5/5 |
| `adb shell input keyevent KEYCODE_MOVE_HOME KEYCODE_FORWARD_DEL ×40` | 1/1 | 1/1 | 3/5 | 5/5 |
| `adb shell input keycombination 113 29` then `keyevent KEYCODE_DEL` | **fails**: types `a` | **fails** | 5/5, plus 1 miss in another run | 5/5 |
| `adb shell input keyevent --longpress KEYCODE_DEL` | fails: deletes 2 characters | fails | fails | fails |
| `adb shell input keyevent KEYCODE_CTRL_LEFT KEYCODE_A KEYCODE_DEL` | fails: no change | fails | fails | fails |
| Settings search (`ctrl+a`, then `backspace`) | cleared | | cleared | |

- **Why `keycombination` fails on Android 12.** The command exists there (`adb shell input` lists it). But it presses the keys without Ctrl's meta state, so the field receives a plain `a`:

  ```
  $ adb shell input keycombination 113 29   # field held "old value 123"
  after keycombination: 'old value 123a'
  ```

- **Why mobilecli's version works.** `io keys ctrl+a` sends `device.io.keys` to mobilecli's on-device agent. The agent presses Ctrl with `META_CTRL_ON` set, then presses A (`agents/android/java/Input.java`, `pressKey`). That works on API 31 and 36 alike, and it avoids the ~0.15–0.4 s JVM start that each `adb shell input` costs.
- **Why the one-call form is flaky on Compose.** A Compose text field applies Ctrl+A as a state change on the next frame. A backspace that arrives in the same burst still sees the old cursor, deletes one character, and then the selection is lost (`old value 12`). Two separate calls leave about 40–80 ms between them. That was enough in 29 of 30 Compose runs; the one miss (API 36) left one character deleted. A 0.2 s pause between the calls cleared 20/20. Classic `EditText`s act on the key at once, so they don't care.
- **The delete-loop fallback** (`end`, then N× `backspace`) also works everywhere, but it only deletes N characters. The driver would have to know the length of the current value, and a password field only shows bullets.

**Replace in one step.** Selecting all and then pasting replaces the selection. The commands are `io keys ctrl+a`, then `io clipboard set -- "<text>"`, then `io keys ctrl+v`. It replaced the text correctly on both versions and both field kinds (0.10–0.28 s). mobilecli's `io button` rejects `KEYCODE_PASTE`, but `io keys ctrl+v` works.

### Exactness of typed values

The command is `mobilecli io text --device D -- "<text>"`, read back from the on-screen echo. Each row was sent the same way on API 31 and API 36, into the plain Compose field and into the Settings search field:

| Sent | `io text` | `adb shell input text` (spaces as `%s`, single-quoted for the device shell) |
| --- | --- | --- |
| `Wi-Fi & 50% "off"` | exact | exact |
| `a"b'c$d&e;f\|g\h%i j ` (with a trailing space) | exact | exact |
| `` `~!@#*()<>?[]{}^=+_,./: `` | exact | exact |
| `50%s off` | exact | **wrong**: `50  off`, because `input text` always turns `%s` into a space and has no escape for it |
| `  two  spaces` | exact | exact |
| `-5`, `--help` (after `--`) | exact | not tried |
| `café`, `Tiếng Việt`, `日本` | exact (API 31; mobilecli pastes non-ASCII text through the clipboard, then empties the clipboard) | can't type non-ASCII |

The iOS driver refuses values that start with `-` (`UNSUPPORTED_LEADING_DASH_TEXT`, a MobileBuildMCP limit). mobilecli has no such limit as long as the driver passes `--` before the text.

### Fields that reformat, and password fields

| Field | Sent | What the capture shows (`text`) | The app's real value |
| --- | --- | --- | --- |
| Compose phone field with a visual transformation | `5551234567` | `(555) 123-4567` | `5551234567` |
| same | `555-12a34567890` | `(555) 123-4567` | `5551234567` (the app filtered it) |
| Compose field that uppercases in `onValueChange` | `abc Def` | API 31: `ABC DEF` (3/3 exact with `io text`, `adb input text` and paste). **API 36:** `io text` gave `ABCDEF`, `ABC`, `ABCDEF`; `adb input text` gave `ABC`, `ABCEF`, `ABCDEF`; **paste gave `ABC DEF` 3/3** | same as shown |
| Compose password field (`PasswordVisualTransformation`) | `Secr3t!` | `•••••••` (all bullets); empty field: `""` with no hint | `Secr3t!` |
| Classic password `EditText` | `Secr3t!` | `••••••!`: **the last character shows** for a moment, because the emulator's "show passwords" setting is on | `Secr3t!` |

- **A capture shows the transformed text, not the stored value.** A value typed into a formatting field won't read back equal to what was sent.
- **Typing key by key can lose characters.** On Android 16, a field that rewrites its value on every change dropped characters, and always dropped the space. Pasting the whole text in one step was exact.
- **The agent knows which fields are passwords, but the tree the bridge gets doesn't say.** Both kinds of password field have `password=true` in mobilecli's agent (read directly, below). mobilecli's `dump ui --format raw` drops that flag. As things stand, the bridge can only guess a password field from a text made of bullets, and a classic field can leak its last typed character into the capture and Jev's view.

## 2. Tap: coordinates vs mobilecli ref

| Measure (probe app, anim screen) | API 31 | API 36 |
| --- | --- | --- |
| `mobilecli io tap --device D X,Y` | 0.017–0.024 s (5 runs) | 0.011–0.015 s |
| `mobilecli io tap --device D @eN` | 0.14–0.20 s | 0.12–0.18 s |
| JSON dump (the only format with refs), first call | 1.69 s | 1.77 s |
| raw dump (the format the bridge uses) | 0.024 s | 0.022 s |

- **Tapping by ref costs two dumps.** `io tap @eN` re-dumps the screen, numbers every element in tree order and taps the centre of element N (`commands/input.go`, `resolveRefTapPoint`: "Refs are positional against a fresh dump; there is no staleness tracking"). Refs appear only in the default JSON dump, so the bridge would need that dump as well as the raw one.
- **A stale ref is silent.**
  1. I read `@e34` = the Count button (API 36; `@e47` on API 31).
  2. I opened the panel above it, which pushes the button down.
  3. `@e34` now pointed at the panel's text. `io tap @e34` tapped the panel, and the counter stayed at 0. mobilecli raised no error.
- **Stale coordinates are just as wrong.** The same button moved from y=432 to y=595.
- **What protects the bridge is a fresh, settled capture before every action**, with the selector matched again against it (§5), not the tap method. Coordinates are 10× faster and never point at a different element than the capture the bridge just matched.

## 3. Swipe within an element

### Swipes work in all four directions

The driver swipes along the element's centre line, from 90% to 10% of its span, for example `mobilecli io swipe --device D 540,919,540,373`. "up" means the finger moves up, so the content scrolls forward, as in the iOS guide's examples. Results were the same on API 31 and 36:

| Element | up | down | left | right | cross-axis |
| --- | --- | --- | --- | --- | --- |
| `LazyColumn` (683 px tall) | +5 rows per swipe | −5 rows | – | – | no effect |
| `LazyRow` | – | – | +4 chips | −4 chips | no effect |
| `Column.verticalScroll` | +417 px | −414 px | – | – | no effect |

- **Duration matters.** At mobilecli's default of 1000 ms, the list moves about as far as the finger, with almost no fling afterwards. The whole call takes 1.01 s.
- **At `--duration 300`,** the list keeps flinging after the finger lifts (for example rows 5 → 7 over the next second), so the next capture needs the settle rule. The call takes 0.31 s.
- **Pick the swipe inside the element.** Starting 10% inside it keeps the swipe off the screen edges when a list fills the screen (the gesture bar is 63 px tall).

### Where the `scrollable` flag is, and where it is lost

| Source | `LazyColumn` / `LazyRow` (Compose, class `android.view.View`) | `Column.verticalScroll` | Cost |
| --- | --- | --- | --- |
| Raw `adb exec-out uiautomator dump /dev/tty` | `scrollable="true"` (API 31 and 36) | class `android.widget.ScrollView`, `scrollable="true"` | 1.95 s per dump on API 31. It prints `Killed` while mobilecli's `DeviceServer` runs, and killing the server costs about 0.75 s on the next mobilecli call |
| mobilecli `dump ui --format raw` | **no `scrollable` key** | class `android.widget.ScrollView` | 0.02 s |
| mobilecli's agent, `device.dump.ui` read directly (`05-assets/direct-dump.sh`) | `scrollable: true`, and also `password`, `focusable`, `long-clickable` | `scrollable: true` | 0.43 s for the first dump after a change (the same 500 ms idle wait), then about 0.02 s |
| mobilecli's uiautomator fallback (`rawData` as XML) | would include `scrollable`, because it is the raw XML | | happens only when the `DeviceServer` can't start, so the bridge can't choose it |

- **Why the raw format has no flag.** The on-device agent writes `scrollable`, `password`, `focusable`, `long-clickable`, `index` and `package` (`agents/android/java/UiTreeSerializer.java:115-133`, mobilecli 1.0.14). The Go side then decodes the agent's JSON into the struct `uiNode` (`devices/android.go:1430-1445`), which has no fields for them, and encodes that struct again as `rawData` (`getDeviceServerDump`, `devices/android.go:1618-1630`). Everything the struct doesn't name is lost.
- **Compose's own rules.** A `verticalScroll` column already reports class `android.widget.ScrollView`, so the mapping's class rule finds it today. Only lazy lists and grids stay plain `View`s with the flag.
- **The flag doesn't give the axis.** A `LazyRow` and a `LazyColumn` look the same. The bridge doesn't need the axis, though: the script picks the direction, and a cross-axis swipe does nothing.
- **Reading the agent directly.** mobilecli already keeps `adb forward tcp:<port> localabstract:mobilecli-server` open. The bridge reads the port from `adb forward --list` and posts `{"jsonrpc":"2.0","id":"1","method":"device.dump.ui","params":{"waitUntilIdle":2000}}` as HTTP to `127.0.0.1:<port>` (`05-assets/direct-dump.sh`).
- **Why this matters for scripts.** On iOS, a Compose Multiplatform `LazyColumn` is a `scroll-view`: the guide's Compose gallery example swipes it. Without the flag, the same script can't swipe on Android.

## 4. Typing speed

The target field was cleared before each run, and every run below typed the value exactly. The command for each path is in the table.

| Path | 17 characters (`Wi-Fi & 50% "off"`), API 31 / API 36 | 100 characters, API 31 / API 36 |
| --- | --- | --- |
| `mobilecli io text --device D -- "<text>"` | 0.09–0.26 s / 0.16–0.28 s | 1.17–1.45 s / 1.86–3.09 s |
| `adb shell input text '<escaped>'` | 0.16–0.32 s / 0.23–0.35 s | 1.26–1.46 s / 1.33–2.12 s |
| `mobilecli io clipboard set --device D -- "<text>"`, then `mobilecli io keys --device D ctrl+v` | 0.07–0.11 s / 0.07–0.20 s | 0.08–0.12 s / 0.06–0.10 s |
| Clear: `io keys ctrl+a`, then `io keys backspace` | 0.03–0.11 s / 0.06–0.14 s | |

- **The spike's number doesn't reproduce.** Its 4.8 s for 17 characters is 20–50× slower than these runs. mobilecli 1.0.11 moved text input from `adb shell input` into its on-device agent (CHANGELOG), so the spike probably timed a cold start (daemon and agent) or an older build.
- **`io text` costs about 12–30 ms per character.** A replace of a short value takes about 0.15–0.4 s in total.
- **Pasting is the only path whose time doesn't grow with length.** It is also the exact path for fields that rewrite their value (§1).
- **Pasting has costs:**
  - it overwrites the device clipboard;
  - it bypasses per-key handling, for example one-character-per-box code fields that move focus on each key;
  - fields that forbid pasting would refuse it.

## 5. After an action: waiting for the screen to settle

> **Correction, 2026-09-29 (second spec review).** The timelines below stamp each capture with the time its request **started**. A capture reads the tree at the end of its ~0.6 s idle wait, so "250 ms apart" here can count that wait as separation: two requests 610 ms apart could read trees 30 ms apart. The rule the release uses measures from when the earlier capture **returned** to when the later one starts. Replaying that rule on these same 24 timelines (a capture's end taken as the next one's start, since they ran back to back): 0 false settles, and a still screen settles at 0.85–0.94 s, about 0.25 s later than the 0.60–0.66 s below. So "it adds nothing on a still screen" holds only for the uncorrected clock.

**Method** (`05-assets/settle.py`): do the action, then take raw dumps back to back for 3 s. Each capture gets a signature built from class, text, hint, content-desc, resource-id, checked, enabled, selected, focused and rect of every visible node, with the status bar (`com.android.systemui:` subtrees) left out. The clock ticking in the status bar otherwise looks like a change.

**The two settle rules replayed on each timeline:**

- **back-to-back:** stop at the first capture equal to the one before it.
- **250 ms apart:** stop at the first capture equal to one taken at least 250 ms earlier.

A settle is false when the capture the rule stops on isn't the final screen. Times are seconds after the action.

| API | Animations | Scenario | Final screen from | Back-to-back stops at | 250 ms apart stops at | Slowest single dump |
| --- | --- | --- | --- | --- | --- | --- |
| 31 | on | panel slides in (800 ms) | 0.80 | 0.85 | 1.30 | 0.72 |
| 31 | on | counter 0→100 (1500 ms) | 1.52 | **1.29, false** | 1.99 | 0.60 |
| 31 | on | endless spinner appears | 0.02 | 0.64 | 0.64 | 0.61 |
| 31 | on | fast swipe (300 ms) on a lazy list | 0.76 | 0.79 | 1.18 | 0.11 |
| 31 | on | Settings: open "Network & internet" | 0.34 | 0.97 | 0.97 | 0.62 |
| 31 | on | twin: tap Add Apple | 0.03 | 0.60 | 0.60 | 0.56 |
| 31 | off | panel / counter / spinner | 0.02 | 0.65–0.66 | 0.65–0.66 | 0.62 |
| 31 | off | fast swipe on a lazy list | 0.77 | 0.80 | 1.02 | 0.24 |
| 31 | off | Settings: open "Network & internet" | 0.21 | 0.82 | 1.10 | 0.60 |
| 31 | off | twin: tap Add Apple | 0.03 | 0.60 | 0.60 | 0.56 |
| 36 | on | panel slides in (800 ms) | 0.81 | **0.78, false** | 1.26 | 0.70 |
| 36 | on | counter 0→100 (1500 ms) | 1.53 | **1.20, false** | 1.96 | 0.60 |
| 36 | on | endless spinner appears | 0.02 | 0.64 | 0.64 | 0.61 |
| 36 | on | fast swipe on a lazy list | 0.72 | 0.77 | 1.12 | 0.06 |
| 36 | on | Settings: open "Network & internet" | 0.32 | 1.45 | 1.45 | 1.12 |
| 36 | on | twin: tap Add Apple | 0.03 | 0.60 | 0.60 | 0.56 |
| 36 | off | panel / counter / spinner | 0.02 | 0.64 | 0.64 | 0.60–0.61 |
| 36 | off | fast swipe on a lazy list | 0.69 | 0.74 | 1.16 | 0.08 |
| 36 | off | Settings: open "Network & internet" | 0.24 | 0.81 | 1.64 | 0.61 |
| 36 | off | twin: tap Add Apple | 0.03 | 0.61 | 0.61 | 0.57 |

What this shows:

- **mobilecli already waits once.** The first dump after an action waits for 500 ms without accessibility events, with a 2 s cap (`UiTreeSerializer.dump`, `waitForIdle(500, 2000)`). So it takes 0.55–0.72 s, and once 1.12 s; later dumps take about 0.02 s.
- **That wait doesn't cover animations.** The first capture still showed a sliding panel mid-way, a counter at 56–59 on its way to 100, and a list mid-fling.
- **Activity switches can give a blank capture.** The first capture after tapping a Settings row showed no text at all on both versions, with animations on or off (`0 texts`), and the new screen appeared 0.2–0.3 s later.
- **Animations off shrinks most waits, not all.** With the three animation scales at 0, Compose animations and window transitions jump to their end, so most screens were final at the first capture. Fling physics and the brief blank screen of an activity switch still happened.
- **Endless animations don't break capture.** An endless spinner doesn't change the tree, so dumps keep working (about 0.02 s) and the screen settles at once. The spike's "could not get idle state" error didn't occur: mobilecli catches the idle timeout and dumps anyway. A screen with a ticking text, such as a timer, would never settle, hence the cap.
- **The gap matters, and it's cheap.**
  - Comparing back-to-back captures (about 30 ms apart) stopped too early 3 times in 24 runs: on the slow end of a counter, and on a 2-pixel slide.
  - Requiring 250 ms between the two compared captures never stopped early.
  - On a still screen it costs nothing extra, because the first capture's own 0.6 s idle wait already provides the gap: settled at 0.60–0.66 s.

I set all three animation scales (`adb shell settings put global window_animation_scale 0`, and the same for `transition_animation_scale` and `animator_duration_scale`) only on these two emulators. I restored them afterwards (`1.0`, `1.0`, and `settings delete global animator_duration_scale`, which was unset before), and checked the values after restoring.

## Proposed decisions

❓ **Q1 - How the driver replaces a field's text**: Android 12's `input keycombination` doesn't hold Ctrl. Options:
- (a) `io keys ctrl+a`, then a separate `io keys backspace`, then `io text`; check the field in the next settled capture and retry the clear once if it isn't empty.
- (b) `io keys end` + N× `backspace` in one call, with N = the current value's length + margin.
- (c) `io keys ctrl+a`, then set the clipboard and `io keys ctrl+v` (replace in one step).
- (d) `adb shell input keyevent KEYCODE_MOVE_END KEYCODE_DEL …`.

➡️ **(a)**, with a 0.2 s pause between the two key calls. Without the pause, two calls cleared Compose fields in 29 of 30 runs; with it, 20 of 20. Classic fields and the Settings search field cleared every time. It takes 0.03–0.14 s, plus the pause, and doesn't depend on knowing the old value, which a password field hides. (b) needs the length, and (d) pays for an `adb shell input` process each time. Keep the two key presses as separate calls: in one call, Compose missed the selection in 5/5 runs on API 31.

❓ **Q2 - How the driver types the value**: Options:
- (a) `io text -- <value>` for every value (key by key, with mobilecli's own paste for non-ASCII).
- (b) Always paste: set the clipboard, then `ctrl+v`.
- (c) `io text` normally, with paste as an opt-in per step or per run.

➡️ **(a)**, with (c) noted as a later option. `io text` was exact for every ASCII special character, spaces and a trailing space. It also typed Vietnamese, and it types the way a keyboard does, which apps expect. It is fast enough (17 characters in about 0.2 s). Paste is faster for long text, and it was the only exact path into a field that uppercases on Android 16, but it overwrites the device clipboard and skips per-key handling. Two further points:
- Drop the `-` ban that iOS has: with `--`, mobilecli types `-5` fine.
- Update the map: non-English typing works through mobilecli on API 31, so it doesn't need to stay out of scope. Only Android 12 was checked on screen.

❓ **Q3 - Reading typed values back**: A capture shows formatted text (`(555) 123-4567` for `5551234567`), and bullets for passwords. Options:
- (a) Verify that the field equals the typed value, and fail the step if it doesn't.
- (b) Don't verify; record the field's shown value in the report after typing.
- (c) Verify only fields with no formatting (not possible to know).

➡️ **(b).** Formatting fields legitimately differ from what was typed, so strict checking would give false failures. Recording the shown value makes a lost character visible to the reader and to Jev.

❓ **Q4 - Password fields**: mobilecli's raw tree drops the `password` flag, and a classic password field shows its last typed character for a moment. Options:
- (a) Treat any `EditText` whose text is all `•` as a password (heuristic).
- (b) Get the real flag (the same source as Q6), and give password fields no `value`: only "has text", or the length.
- (c) Do nothing.

➡️ **(b).** It needs the same fix as Q6, so it costs nothing extra. It also stops a real character leaking into the report and Jev's view.

❓ **Q5 - Tap by coordinates or by mobilecli ref**: Options:
- (a) Tap the centre of the element's rect from the settled capture (`io tap X,Y`).
- (b) Tap by mobilecli ref (`io tap @eN`).

➡️ **(a).** It is 0.011–0.024 s against 0.12–0.20 s, and needs one dump instead of two. A ref is only a position in the tree, and after a screen change it silently hit the wrong element. Safety comes from matching the selector on a fresh, settled capture just before tapping, not from refs.

❓ **Q6 - How `swipeWithin` finds Compose lists** (the `scrollable` flag): Options:
- (a) **Upstream change:** ask mobilecli to keep `scrollable` (and `password`, `focusable`, `long-clickable`) in `uiNode`. It's about four struct fields. After that, bump the pin and re-run the evidence. Until it ships, Compose lazy lists can't be swiped on Android.
- (b) **Second source, reading mobilecli's agent directly:** read the forward port from `adb forward --list` and POST `device.dump.ui` to the agent mobilecli already runs. This returns the full tree with the flags, in the same time as `dump ui`. About 30 lines of driver code. Risk: it's an internal protocol, but the pin is exact and every bump re-runs the evidence anyway.
- (c) **Second source, raw `uiautomator dump`:** it has the flag, but it takes about 2 s, can't run while the agent is alive, and killing the agent costs about 0.75 s. Too slow per capture.
- (d) **Documented limit:** Compose lazy lists aren't `scroll-view` on Android. Scripts that swipe a Compose list on iOS then fail on Android. That hits the owner's main app type (Compose Multiplatform) and the guide's own Compose gallery example.

➡️ **(b) now, and (a) as a follow-up for the owner to file.** (b) fixes lists and password fields in v1.2.0 with no speed cost. When an upstream release keeps the fields, the driver can switch back to `dump ui --format raw` at the next pin bump. The mapping change is small: a node with `scrollable: true` becomes `scroll-view`, whatever its class. (d) breaks the same script on the two platforms.

❓ **Q7 - How the driver swipes**: Options:
- (a) Swipe along the element's centre line from 90% to 10% of its span, at mobilecli's default 1000 ms.
- (b) The same span at 300 ms.

➡️ **(a).** At 1000 ms the list moves about as far as the finger (+5 rows in a 683 px `LazyColumn`, +417 px in a scroll column) with almost no fling, so the result is repeatable across runs and API levels. 300 ms saves 0.7 s but adds a fling of about 2 more rows that varies. Both need the settle rule.

❓ **Q8 - Waiting for the screen to settle after an action**: Options:
- (a) Take one capture after the action (mobilecli's 500 ms idle wait only).
- (b) Capture until two captures match, back to back.
- (c) Capture until two captures taken **at least 250 ms apart** match, with the status bar left out of the comparison. Cap at 3 s, then go on with the last capture and mark the step "screen still changing" in the report.
- (d) A fixed sleep.

➡️ **(c).** (a) returned mid-animation, mid-fling and even blank screens. (b) stopped too early 3 times in 24 runs. (c) never did. On a still screen it adds nothing: 0.60–0.66 s, the first dump's own wait. A 1.5 s animation costs about 2 s. The cap keeps a ticking timer screen from hanging a run.

❓ **Q9 - Animations in the setup guide**: Options:
- (a) Tell people to turn all three animation scales to 0.
- (b) Tell them it's optional and makes runs faster.
- (c) Say nothing.

➡️ **(b).** With animations off, screens were final at the first capture in 8 of 12 runs, against 4 of 12 with them on. The settle rule stays correct either way, and ticket 03 already settled that the bridge never changes device settings itself.

## Not checked

- The owner's cmp app (not installed on these emulators) and the Xiaomi (off limits). MIUI's input path may differ; it needs "USB debugging (Security settings)" per the spike.
- API 32 separately. It is also Android 12, and the `input` and agent code paths are the same as API 31's.
- Non-ASCII typing on API 36 (API 31 only).
- Whether a Compose list that can't scroll (its content fits) reports `scrollable=false`.
- Swipe durations between 300 and 1000 ms.

## Disk and clean-up

- **Disk used:** the API 31 system image is 4.2 GB (`~/Library/Android/sdk/system-images/android-31`), and the AVD `jev-actions-api31` is 932 MB (`~/.android/avd/jev-actions-api31.avd`), about 5.1 GB together. Free space went from 16 GB to 12 GB. I kept both for the owner to decide.
- **Clean-up:** `mobilecli daemon stop`, `adb shell pkill -f com.mobilenext.mobilecli.DeviceServer` and `adb forward --remove-all` on both emulators, then `adb emu kill` for each. Then `adb -P 5099 kill-server`, and `/tmp/jev-mcli-05` and `/tmp/jev-probe-05` deleted.
- **Restored settings:** the animation scales on both emulators.
