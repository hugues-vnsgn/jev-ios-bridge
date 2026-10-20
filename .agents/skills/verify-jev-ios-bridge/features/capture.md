# Android capture

Print the Android screen currently in front as element JSON lines or as the exact text a checkpoint would send to Jev, without restarting the app.

## Sub-features

- `capture-elements` prints one JSON object per captured element.
- `capture-jev` prints the screen's Jev representation.
- `capture-selection` selects by `--serial`, then `--avd`, then `JEV_ANDROID_DEVICE`.
- `capture-busy` refuses a foreign automation owner and preserves its processes.
- `capture-cleanup` stops only the capture's agent and removes its forward and lease.

## How to get to it (user POV)

Bring the assigned Android diagnostic to its initial screen, then run `capture --serial <serial>` or `capture --avd <AVD>`. Add `--jev` for Jev text. The command needs no Jev key and takes no screenshot.

## Driving it with the CLI

Preconditions:

- Complete Launch and Doctor in the main skill.
- Use the Android build/install/start steps in [scripted checks](scripted.md), an assigned emulator serial, and its actual AVD name as `assigned_avd`.
- The initial screen shows `Selected: None`. No other automation owner holds this emulator.

- **Record ownership.** Save the target serial/AVD, foreground activity, and agent/ADB-forward inventory before capture. Every device command must name the assigned serial. Shared inventory is observation only.
- **Capture elements.** Run the first command below and save stdout, stderr, and exit. Require exit 0. Parse each stdout line separately as JSON. Require a text element `selection.summary` with label `Selected: None`, and the button `choose.apple` with label `Add Apple ($2)`.
- **Capture Jev text.** Run the second command without changing the screen. Require exit 0, the Android screen header, and the same visible selection and controls. This prints the checkpoint representation locally and makes no Jev call.

```sh
node "$bridge_root/dist/cli.js" capture --serial "$assigned_serial"
node "$bridge_root/dist/cli.js" capture --serial "$assigned_serial" --jev
```

- **Check alternate selection.** With a uniquely named running assigned AVD, run `node "$bridge_root/dist/cli.js" capture --avd "$assigned_avd"`. Then run `JEV_ANDROID_DEVICE="$assigned_serial" node "$bridge_root/dist/cli.js" capture`. Require the same initial elements and exit 0. If the AVD name is ambiguous, record `DEVICE_AMBIGUOUS` and the uncovered AVD journey.
- **Check cleanup and state.** Compare before/after inventory and foreground activity. Require no capture-owned agent or forward and a released lease. Capture does not restart or stop the app, although it may wake a screen that was only off. Retain receipts after the main skill's Cleanup.
- **Check busy refusal only with a controlled owner.** Arrange an explicitly authorized competing automation owner on this assigned emulator. Run `capture --serial "$assigned_serial"`. Require exit 3, no stdout, and stderr `DEVICE_BUSY: ...`. Confirm the other owner's process/forward remains intact. Stop only the competing process this verification created. Without that controlled owner, mark this sub-feature not run.

## Gotchas

- Capture takes a device lease and starts automation. It is a live device action, even without a key, so it is not a read-only doctor or a W2 check.
- `--json`, `--max-steps`, `--timeout-ms`, `--no-log-pane`, and `--no-device-window` are invalid for capture and exit 3. Structured JSON lines are already the default.
- Empty or missing fields stay omitted. A `selectable: false` text can appear beside a button with the same label. Select the button for guards/actions.
- `--jev` refuses an empty readable screen with `EMPTY_SCREEN`. Missing tools, a disconnected or locked device, and cleanup failure return exit 3 with `CODE: message` on stderr. A signal exits 130 or 143 after cleanup.
- The repo does not provide a running foreign owner or an empty-screen fixture on a device. Missing either is an unmet precondition, not permission to use another connected device. Never drive the phone `2985e9c` or stop the shared ADB server.
