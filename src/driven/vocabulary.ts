// Driven mode's hand-back words, in a leaf module so the run log can pass them through redaction without loading
// driven mode itself.
import type { HandbackAnswer } from './step.js';

/** Every answer kind, in the order a package lists them. */
export const HANDBACK_ANSWER_KINDS: readonly HandbackAnswer['kind'][] = ['tap', 'tapAt', 'type', 'scroll', 'back', 'revise', 'done', 'stop'];

/** What each hand-back reason means, for Claude, and the reasons the run log passes through. Keyed by string, not
 *  PauseReason, so LOCAL_ONLY_SCREEN (Issue 09) has its text before it joins that type; a reason missing here is
 *  shown as its code alone. */
export const PAUSE_REASON_TEXT: Readonly<Record<string, string>> = {
  LOW_CONFIDENCE: 'Jev was not confident enough in any action, even after scrolling to search.',
  NONE_FITS: 'Jev found no listed action that performs the step, even after scrolling to search.',
  RISKY_ACTION: 'Jev picked a control with a risky word (delete, remove, sign out, pay...); the bridge never takes those itself.',
  DESTRUCTIVE_STEP: 'The step is marked destructive: Claude picks its actions.',
  PERMISSION_DIALOG: 'A system permission dialog is on screen (allow notifications, paste, photos...); Jev never answers those.',
  APP_ERROR_DIALOG: 'Android\'s app error dialog is on screen (an app isn\'t responding or keeps stopping); Jev never answers those.',
  LOCAL_ONLY_STEP: 'The step is localOnly: its screens never go to Jev, so Claude picks every action.',
  LOCAL_ONLY_SCREEN: 'The screen matches a localOnlyScreens rule, so it is not sent to Jev.',
  NO_PREFLIGHT: 'The step is a test write and the project preflight did not pass, so Claude picks its actions (Jev does not search either).',
  UNREADABLE_SCREEN: 'The screen could not be read as text for Jev (empty, truncated or too large); see the screenshot.',
  SCREEN_UNCHANGED: 'An action and its retry left the screen unchanged.',
  REPEATED_ACTION: 'Jev picked the same action a third time in this step.',
  SCREEN_LOOP: 'The run went back and forth between two screens.',
  DECISION_BUDGET: 'The step used all its Jev decisions. After your action Jev checks once whether the step is done.',
  SCREEN_CHANGED: 'The screen changed before your last answer could be carried out, so nothing was done; answer for '
    + 'this screen. If it keeps changing on its own (a timer, say), answer revise or stop.',
};
