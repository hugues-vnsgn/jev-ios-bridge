/**
 * Bridge-owned vocabularies frozen by ADR-0005. A MobileBuildMCP release cannot change them:
 * the driver translates vendor roles, and unknown vendor error codes become DEVICE_ERROR.
 * 1.x may add entries; renaming or removing one needs 2.0.
 */

/** Selector roles. Today they equal MobileBuildMCP 2.7.1's rs/1 role strings. */
export const ROLES = [
  'application', 'window', 'button', 'keyboard-key', 'text-field', 'menu', 'text', 'image',
  'switch', 'slider', 'cell', 'scroll-view', 'list', 'tab', 'other',
] as const;
export type Role = typeof ROLES[number];

/**
 * The 1.1 bridge reason codes, frozen exactly as shipped. MobileBuildMCP's device-layer errors pass
 * through only when their code is one of these; every other vendor code becomes DEVICE_ERROR plus
 * vendorCode. This keeps a later addition to REASON_CODES (for example an Android-only code that
 * happens to share a name with a MobileBuildMCP code) from silently starting to pass through too.
 */
const REASON_CODES_1_1 = {
  // Outcomes
  ALL_CHECKPOINTS_PASSED: 'Every step ran and every checkpoint claim was established.',
  ASSERTION_FALSE: 'A checkpoint claim was confidently false (probability at or below 0.1).',
  ASSERTION_UNCERTAIN: 'A checkpoint claim was neither established nor rejected (between 0.1 and 0.9).',
  // Script and screen
  GUARD_MISSING: 'A guard required an element that was not visible.',
  GUARD_AMBIGUOUS: 'A guard selector matched more than one visible element.',
  GUARD_FORBIDDEN: 'A guard forbade an element that was visible.',
  TARGET_MISSING: 'No element matched the action selector.',
  TARGET_UNAVAILABLE: 'The action target was hidden, disabled, or does not support the action.',
  TARGET_AMBIGUOUS: 'The action selector matched more than one usable element.',
  INVALID_SELECTOR: 'A selector had no usable field.',
  SNAPSHOT_TRUNCATED: 'The device capture was truncated, so selection was refused.',
  SCREEN_CHANGED: 'The screen changed while refreshing a stale target.',
  WAIT_TIMEOUT: 'A wait step did not see its until-guard in time.',
  SCRIPT_INCOMPLETE: 'The script ended without completing every step.',
  // Limits and control
  STEP_LIMIT: 'The run reached its step limit.',
  WALL_LIMIT: 'The run reached its wall-time limit.',
  CANCELLED: 'The run was cancelled.',
  // Assertion observation
  TRUNCATED: 'The checkpoint capture was truncated, so no judgment was requested.',
  EMPTY_SCREEN: 'The checkpoint screen had no visible evidence to judge.',
  STATE_BUDGET: 'The checkpoint screen text exceeded the judgment size budget.',
  // Jev judgment
  INVALID_INPUT: 'The judgment request was invalid.',
  REQUEST_BUDGET: 'The judgment request exceeded its size budget.',
  MALFORMED_RESPONSE: 'Jev returned a response the bridge could not accept.',
  INVALID_JUDGMENT: 'A judgment failed the bridge\'s consistency checks.',
  ABORTED: 'The judgment request was aborted.',
  TIMEOUT: 'The judgment request timed out.',
  AUTH: 'TypeSafe rejected or lacks the API key.',
  RATE_LIMIT: 'TypeSafe rate-limited the judgment request.',
  SERVICE: 'TypeSafe returned a service error.',
  NETWORK: 'The judgment request could not reach TypeSafe.',
  UNKNOWN: 'The judgment request failed for an unclassified reason.',
  // Device
  NO_DEVICE: 'No device was configured for the script\'s platform.',
  INVALID_DEVICE: 'The configured device does not have the shape the script\'s platform requires.',
  DEVICE_BUSY: 'The device is in use, by another run or by another tool\'s UI-automation agent (a foreign agent).',
  DEVICE_ERROR: 'The device layer reported an error; its own code is kept as vendorCode.',
  INVALID_JSON: 'The device layer returned output that was not JSON.',
  INVALID_ENVELOPE: 'The device layer returned an unsupported result envelope.',
  TERMINAL_ACK_MISSING: 'The device layer did not return the expected result.',
  INVALID_CAPTURE: 'The device layer returned no runtime snapshot.',
  EMPTY_CAPTURE: 'The device layer returned no usable elements.',
  UNSUPPORTED_ACTION: 'The target does not support the requested action.',
  MISSING_VALUE: 'A typing step named a value the script did not supply.',
  UNSUPPORTED_LEADING_DASH_TEXT: 'The pinned device layer cannot type text that starts with a hyphen.',
  UI_ACTION_UNCONFIRMED: 'A device operation was never acknowledged, so the device lock was kept.',
  CLEANUP_FAILED: 'Device cleanup did not finish.',
  APP_EXITED: 'The app under test exited during the run (a crash or a quit); check its crash report.',
  // Bridge
  EXECUTION_ERROR: 'The run stopped on an unexpected execution error.',
  INTERNAL_ERROR: 'The bridge could not complete the run; check local setup.',
  INTERRUPTED: 'The run log has no verdict: the bridge process stopped before recording one.',
} as const satisfies Record<string, string>;

/** Every reason a verdict or error event can carry, with the meaning the guide documents. */
export const REASON_CODES = {
  ...REASON_CODES_1_1,
  // Device (Android, added in 1.2; see "How a script names an Android app and device" and
  // "open point 3" in the Android release spec)
  DEVICE_NOT_CONNECTED: 'The named serial isn\'t listed by adb or is offline, or no running emulator has the named AVD.',
  DEVICE_AMBIGUOUS: 'More than one running emulator has the named AVD, so the bridge can\'t tell them apart.',
  DEVICE_UNAUTHORIZED: 'The device hasn\'t accepted this Mac\'s USB-debugging key.',
  DEVICE_NOT_BOOTED: 'The device hasn\'t finished booting.',
  DEVICE_LOCKED: 'The device\'s screen is locked.',
  APP_NOT_INSTALLED: 'The app\'s package isn\'t installed on the device.',
  APP_NOT_RESPONDING: 'The app froze (Android showed "App isn\'t responding") during the run.',
  DEVICE_UNSUPPORTED: 'The device is below Android 12 (API 31), which this bridge does not support.',
  ANDROID_TOOLS_UNAVAILABLE: 'adb could not be found, the pinned mobilecli package is missing, or its agent does not match the pinned SHA-256.',
} as const satisfies Record<string, string>;
export type ReasonCode = keyof typeof REASON_CODES;

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === 'string' && Object.hasOwn(REASON_CODES, value);
}

/**
 * MobileBuildMCP device-layer errors pass through only when their code is one of these — the codes
 * shipped in 1.1, frozen here rather than read off the live REASON_CODES. A 1.2+ addition to
 * REASON_CODES (an Android-only code, or a future one) never starts passing through automatically:
 * see ADR-0005 and "Reason codes" in the Android release spec.
 */
export const MOBILEBUILDMCP_PASSTHROUGH_CODES: ReadonlySet<string> = new Set(Object.keys(REASON_CODES_1_1));
