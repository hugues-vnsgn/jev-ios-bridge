# Script format

A script is one JSON object. Unknown fields are rejected, and so are scripts without a `"version"`. This page describes version 1; [version 2](#version-2-do-steps-experimental) adds `do` steps, `goal` and `start` on top of it.

## Top level

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `version` | yes | `1` | The script format version. |
| `platform` | no | `"ios"` or `"android"` | Which device this script targets. Absent, or `"ios"`, reads the script exactly as a 1.1 iOS script, and rejects every Android-only field below. |
| `app` | yes | object | See below. Its allowed fields depend on `platform`. |
| `device` | no | object | See below. Its allowed fields depend on `platform`. |
| `preconditions` | no | array of strings | Up to 20, each 1–500 characters. Describes setup you arranged. It isn't executed. |
| `values` | yes | object: key → string or `{ "fromEnv": NAME }` | What to type: a literal, or the name of an environment variable the bridge reads when the run starts ([values from the environment](#values-from-the-environment)). Up to 32; each value at most 2048 characters (UTF-16 code units, so on Android an emoji or other character outside the Basic Multilingual Plane counts as two). Keys start with a letter, then letters, digits, `_`, or `-` (up to 64 characters). Use `{}` when there's nothing to type. On iOS, values must be printable US-keyboard characters and none may start with `-`. On Android, values may be any Unicode text except control characters, and a leading `-` is allowed. See [how Android types values](#how-android-types-values). |
| `steps` | yes | array | 1–100 steps with unique `id`s. The last one must be a `checkpoint`. |

## `app`

iOS (no `platform`, or `"platform": "ios"`):

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `bundleId` | yes | string | The installed app's bundle ID. |
| `launchArgs` | no | array of strings | Up to 20, each 1–200 printable characters. Passed to the app process at launch. |

Android (`"platform": "android"`):

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `package` | yes | string | The installed app's package name: two or more dot-separated parts, each starting with a letter, then letters, digits, or `_` (for example `com.example.app`). |
| `activity` | no | string | Starts a specific activity instead of the launcher activity. Relative (`.DebugGalleryActivity`) or fully qualified. |
| `intentExtras` | no | object: string → string | Passed to the launch intent with `am start --es`. Up to 20 entries; each value 1–200 printable ASCII characters. |

`app.bundleId` and `app.launchArgs` are rejected on Android; use `app.package` and `app.intentExtras` instead. `app.package`, `app.activity`, and `app.intentExtras` are rejected on iOS.

## `device`

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `udid` | no | string | iOS only. Overrides `JEV_DEVICE_UDID` and `.mobilebuildmcp/config.yaml`. Must be an 8-4-4-4-12 UUID. Rejected on Android; use `serial` or `avd`. |
| `serial` | no | string | Android only. The adb serial exactly as `adb devices` prints it, matching `^[A-Za-z0-9._:-]{1,100}$`. At most one of `serial` or `avd`. |
| `avd` | no | string | Android only. An emulator's AVD name, matching `^[A-Za-z0-9._-]{1,100}$`. At most one of `serial` or `avd`. |

An Android script with neither `serial` nor `avd` falls back to `JEV_ANDROID_DEVICE`, then fails with `NO_DEVICE`. [Android setup](../12-android-setup.md#name-the-device) explains which to use.

## Values from the environment

Keep a password or other secret out of the script: write `{ "fromEnv": "NAME" }` instead of the text, and the bridge types the variable's value.

```json
"values": { "user": "ops-test@example.com", "password": { "fromEnv": "APP_PASSWORD" } }
```

- `NAME` is letters, digits and `_`, not starting with a digit. The object takes no other field.
- The bridge reads the variable once, when the run starts, and masks its value everywhere a literal value is masked ([data handling](../09-data-handling.md#masking-and-its-limits)). The script, `run.jsonl`, `report.json`, the watch page, the log pane and the MCP replies never contain it.
- The platform's typed-value rules above apply to the variable's value.
- A variable that is unset or empty stops the run before the device is touched, with `MISSING_VALUE`, naming the key and the variable but never a value. The CLI exits 3.

**Where the variable comes from.** The bridge reads its own environment:

- **CLI:** the shell you run `jev-ios-bridge run` in, for example `APP_PASSWORD=… npx jev-ios-bridge run login.json`, or `node --env-file=/path/to/.env`.
- **Plugin or MCP server:** the MCP server's environment, not the shell Claude runs commands in. The plugin's server inherits Claude Code's environment, so export the variable in the shell that starts Claude Code (`export APP_PASSWORD=…`, then `claude`), or set it in an MCP server's `env` block when you configure the server yourself. Restart Claude Code after changing it.

## How Android types values

- **ASCII values** (plain English letters, digits, and punctuation) are typed directly. They never touch the device clipboard.
- **Any other value** (`Tiếng Việt`, `café`, an emoji) is pasted: the bridge puts it on the device clipboard, pastes it into the field, then clears the clipboard. **The keyboard may keep it anyway.** Gboard, for one, still offers the pasted text as a clipboard suggestion after the clipboard is cleared, on Android 12 and 16. So a non-ASCII typed value can outlive the run on the device, and shouldn't be a real secret.

Either way, the field is tapped first, its text is replaced, and the next capture records what the field shows (`typedFields` in [`report.json`](report-json.md)).

## Steps

Every step has `id` (same rules as value keys), `kind`, and `guard`.

**`action`:** `guard` plus `action`, one of:

| `action.kind` | Fields | Target needs |
| --- | --- | --- |
| `tap` | `selector` | a visible, enabled element that supports tap |
| `replaceText` | `selector`, `valueKey` (a key in `values`) | a visible, enabled element that supports typing |
| `swipe` | `selector`, `direction`: `up`, `down`, `left`, or `right` | a visible, enabled element that supports swiping within it |

**`wait`:** `guard`, `until` (a guard), and `timeoutMs` (1–60 000). Captures the screen repeatedly until `until` holds. `guard` must hold at every capture.

**`checkpoint`:** `guard` and `assertions`: 1–20 objects `{ "id", "claim" }`. Assertion IDs are unique within the checkpoint. A claim is 1–1000 characters.

## Guards

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `present` | yes | array of selectors | 1–12. Each must match exactly one visible element. |
| `absent` | no | array of selectors | Up to 12. Each must match no visible element. |

## Selectors

| Field | Type | Notes |
| --- | --- | --- |
| `identifier` | string | Accessibility identifier or Compose `testTag`. Exact match. |
| `role` | string | One of `application`, `window`, `button`, `keyboard-key`, `text-field`, `menu`, `text`, `image`, `switch`, `slider`, `cell`, `scroll-view`, `list`, `tab`, `other`. |
| `label` | string | Exact match. |
| `value` | string | Exact match, at least 1 character. It only narrows. |

A selector needs at least one of `identifier`, `role`, or `label`. Strings are 1–500 characters and can't be blank. There are no refs, indices, or partial matches.

## Examples

iOS:

```json
{
  "version": 1,
  "app": { "bundleId": "com.example.app", "launchArgs": ["-evidence-screen"] },
  "preconditions": ["A synthetic account is signed in."],
  "values": { "query": "Berlin" },
  "steps": [
    { "id": "search", "kind": "action",
      "guard": { "present": [{ "identifier": "search.field", "role": "text-field" }] },
      "action": { "kind": "replaceText", "selector": { "identifier": "search.field", "role": "text-field" }, "valueKey": "query" } },
    { "id": "results", "kind": "wait",
      "guard": { "present": [{ "role": "application", "label": "Example" }] },
      "until": { "present": [{ "identifier": "search.results" }], "absent": [{ "identifier": "search.spinner" }] },
      "timeoutMs": 10000 },
    { "id": "verify", "kind": "checkpoint",
      "guard": { "present": [{ "identifier": "search.results" }] },
      "assertions": [{ "id": "city", "claim": "The results list shows Berlin, Germany." }] }
  ]
}
```

Android, starting a debug activity with an intent extra, on a named emulator:

```json
{
  "version": 1,
  "platform": "android",
  "app": { "package": "com.example.app", "activity": ".DebugGalleryActivity", "intentExtras": { "screen": "gallery" } },
  "device": { "avd": "Medium_Phone_API_36.1" },
  "values": {},
  "steps": [
    { "id": "verify", "kind": "checkpoint",
      "guard": { "present": [{ "identifier": "gallery.title", "role": "text" }] },
      "assertions": [{ "id": "title", "claim": "The screen title reads Component gallery." }] }
  ]
}
```

## Version 2: `do` steps (experimental)

Version 2 is version 1 plus three fields, for driven mode: in a `do` step the bridge reads the screen, asks Jev which action performs the step, acts, and checks whether the step is done. Driven mode is experimental, and off until you turn it on ([driven steps](../13-driven-steps.md)). Every version 1 field and step works the same in version 2, and steps of both kinds can be mixed. The last step is still a checkpoint: only a checkpoint passes or fails a run.

Write `"version": 2` only in a script that uses a version 2 field. A `"version": 2` script without a `do` step, `goal` or `start` is rejected with the version 1 message (`Unsupported script version; this bridge reads "version": 1`), as in 1.2. A `"version": 1` script with a `do` step, `goal` or `start` is rejected with a message saying it needs `"version": 2`. The old goal-mode form (a `goal` beside top-level `assertions`) still gets 1.2's unrecognized-key message.

Top level:

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `version` | yes | `2` | |
| `goal` | no | string | 1–500 characters. What the whole script is for. Jev reads it at every decision; without it, Jev reads the step's `intent` as the goal. |
| `start` | no | `"restart"` or `"attach"` | `restart` (the default when absent) launches the app fresh, as version 1 does. `attach` starts from the screen already showing, without relaunching, on Android only for now: the app must be installed and the one in front. Otherwise the run ends `INCONCLUSIVE` with `APP_NOT_IN_FOREGROUND` (`APP_NOT_INSTALLED` when it isn't installed). An attached run leaves the app running when it ends. On iOS the bridge can't tell which app is in front, so an iOS `attach` run ends `INCONCLUSIVE` with `UNSUPPORTED_ACTION` before the simulator is touched. |

**`do`:** `id`, `kind: "do"`, and the fields below. A `do` step has no `guard`: the bridge reads the screen itself.

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `intent` | yes | string | 1–500 characters. What the step does, in plain words, for example `Sign in with the test account`. |
| `doneWhen` | yes | string | 1–500 characters. What the screen shows once the step is done. The bridge checks it on a fresh capture after the last action. |
| `effect` | yes | `"none"`, `"test_write"`, or `"destructive"` | What the step may do to the app's data. `none` reads or navigates only; `test_write` writes to a test environment; `destructive` deletes or changes something that matters. The more risk, the more decisions go back to Claude. |
| `values` | no | array of strings | Keys of `values` this step may type. Each must name a supplied value. Up to 32. |
| `localOnly` | no | boolean | `true` keeps this step's screens away from Jev: every decision in it goes back to Claude. |

Example: sign in with a password read from the environment, then check the home screen.

```json
{
  "version": 2,
  "platform": "android",
  "app": { "package": "com.example.app" },
  "device": { "avd": "Medium_Phone_API_36.1" },
  "goal": "Sign in with the test account and reach the home screen",
  "values": { "user": "ops-test@example.com", "password": { "fromEnv": "APP_TEST_PASSWORD" } },
  "steps": [
    { "id": "signIn", "kind": "do", "intent": "Sign in with the test account",
      "doneWhen": "The home screen greets the test account", "effect": "none", "values": ["user", "password"] },
    { "id": "verify", "kind": "checkpoint",
      "guard": { "present": [{ "identifier": "home.title" }] },
      "assertions": [{ "id": "greeting", "claim": "The home screen greets ops-test@example.com." }] }
  ]
}
```
