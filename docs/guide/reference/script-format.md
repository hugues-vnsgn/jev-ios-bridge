# Script format, version 1

A script is one JSON object. Unknown fields are rejected, and so are scripts without `"version": 1`.

## Top level

| Field | Required | Type | Notes |
| --- | --- | --- | --- |
| `version` | yes | `1` | The script format version. |
| `platform` | no | `"ios"` or `"android"` | Which device this script targets. Absent, or `"ios"`, reads the script exactly as a 1.1 iOS script, and rejects every Android-only field below. |
| `app` | yes | object | See below. Its allowed fields depend on `platform`. |
| `device` | no | object | See below. Its allowed fields depend on `platform`. |
| `preconditions` | no | array of strings | Up to 20, each 1–500 characters. Describes setup you arranged. It isn't executed. |
| `values` | yes | object: key → string | Literals to type. Up to 32; each value at most 2048 characters (UTF-16 code units, so on Android an emoji or other character outside the Basic Multilingual Plane counts as two). Keys start with a letter, then letters, digits, `_`, or `-` (up to 64 characters). Use `{}` when there's nothing to type. On iOS, values must be printable US-keyboard characters and none may start with `-`. On Android, values may be any Unicode text except control characters, and a leading `-` is allowed. |
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

An Android script with neither `serial` nor `avd` falls back to `JEV_ANDROID_DEVICE`, then fails with `NO_DEVICE`.

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

## Example

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
