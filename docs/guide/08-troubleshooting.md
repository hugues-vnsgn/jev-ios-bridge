# Troubleshooting

Find the run's `reason` (in the report, or `report.json`'s `reason`) below. The full list with one-line meanings is in [reason codes](reference/reason-codes.md).

## The script didn't reach the screen it expected

**`GUARD_MISSING`**: a `present` selector matched nothing visible.
- Compare the step's screenshot with your guard. The app may have opened on a different screen, or a popup may cover it.
- A label may differ slightly (curly quotes, trailing punctuation, a space inside). Take a fresh capture ([how](03-identifiers.md#see-what-the-bridge-sees)) and copy the exact text.
- An element scrolled out of view doesn't count: scroll first.

**`GUARD_AMBIGUOUS`**: a `present` selector matched more than one visible element.
- Most often in Compose: a button's label also appears on its text child. Add `role` or use `identifier`.
- Repeated component tags (the same tag on every instance) need a `value`, or per-instance tags.

**`GUARD_FORBIDDEN`**: an `absent` selector matched something visible, typically a sheet or dialog that's still open.

**`WAIT_TIMEOUT`**: the `until` guard didn't hold within `timeoutMs`. Check the last screenshot. The wait's own `guard` must hold at every capture, so use an anchor that stays on screen the whole time.

## The action had no single target

**`TARGET_MISSING`**: nothing matched. **`TARGET_UNAVAILABLE`**: something matched but was hidden, disabled, or doesn't support the action (a tag on a wrapper can't be typed into). **`TARGET_AMBIGUOUS`**: several usable elements matched.

Fix the selector: use the acting element's identifier, add `role`, or narrow with `value`.

## Jev couldn't decide

**`ASSERTION_UNCERTAIN`**: a claim scored between 0.1 and 0.9. Reword it to name printed text, or add a step that brings the evidence on screen. See [write claims](05-writing-claims.md#when-a-claim-comes-back-uncertain). Don't just re-run it.

**`ASSERTION_FALSE`** means **failed**, not a problem: Jev found the claim confidently false. Check the screenshot. If the app is right and the claim is wrong, fix the claim.

## The app or the device

**`APP_EXITED`**: the app died mid-run. Look for a crash report in `~/Library/Logs/DiagnosticReports/`, and check the log pane. Compose Multiplatform before 1.12.1 can crash inside accessibility (`AccessibilityElement.<get-node>`) when screens are captured while dialogs open and close; upgrade.

**`DEVICE_BUSY`**: another bridge process holds the simulator's lock. The message names it. See [cancelling and the device lock](06-running.md#cancelling-and-the-device-lock).

**`NO_DEVICE` or `INVALID_DEVICE`**: set a simulator UUID (`JEV_DEVICE_UDID`, the script's `device.udid`, or `.mobilebuildmcp/config.yaml`). Aliases like `booted` aren't accepted.

**`DEVICE_ERROR`**: MobileBuildMCP reported an error the bridge doesn't have its own code for. `report.json`'s `error.vendorCode` holds MobileBuildMCP's code. Common causes: the simulator isn't booted, or the app isn't installed. A shut-down simulator can make MobileBuildMCP say an installed app is missing.

**`UI_ACTION_UNCONFIRMED`**: a device command never answered, so the lock was kept to protect the device. It's released when the command answers, or when that bridge process exits.

**`CLEANUP_FAILED`**: stopping the app didn't finish. Check that the simulator is still responsive.

## TypeSafe

**`AUTH`**: TypeSafe rejected the API key, or it's missing. Check `TYPESAFE_API_KEY` and your TypeSafe account. A short-lived 403 can clear on its own.

**`RATE_LIMIT`, `SERVICE`, `NETWORK`, `TIMEOUT`**: TypeSafe was unavailable or slow. Run again later.

**`STATE_BUDGET`, `REQUEST_BUDGET`**: the checkpoint screen has too much text to judge (about 24 KB). Check a screen with less on it, or scroll so less is visible.

## Limits and control

**`STEP_LIMIT`, `WALL_LIMIT`**: the run hit `--max-steps` or `--timeout-ms`. **`CANCELLED`**: someone cancelled it. **`INTERRUPTED`**: the bridge process stopped before recording a verdict. That run's evidence is kept, but it proves nothing.
