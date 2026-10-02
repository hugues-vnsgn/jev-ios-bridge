// Candidate actions for a driven (`do`) step, ported from the jev-drives spike (spikes/jev-drives/candidates.ts).
//
// Given one screen's elements and the value keys the step may type, build the closed list of actions Jev may
// choose from:
//   type:<ref>:<valueKey>     each typeable field x each value key the step allows (Jev never writes text)
//   tap:<ref>                 each visible, enabled, selectable, tap-capable element, described as Jev reads it
//   scroll:up | scroll:down   reveal content above / below the current view
//   back                      leave this screen the way the platform's back does
//   step_done                 the current step is already done on this screen; no action needed
//   none_fits                 hand the step back to Claude
// The builder is deterministic: same elements + same value keys -> same keys in the same order. A type option names
// the value by its key, never its text; an element's own value is described as the screen shows it, so masking
// typed text there is the caller's job. It makes no Jev call and reads no key.
//
// Known blind spots, seen in the spike captures (spikes/jev-drives/captures/README.md). The builder does NOT fix
// them; the cases that hit them are labelled so the right answer is `none_fits` (hand back to Claude):
//   - Occluded "visible" elements: iOS sheets, popovers and menus leave the screen underneath in the capture with
//     visible: true (ReadMe 05/06/07, NetNewsWire 07/08/10/11/12, Fossify 02's grid behind the speed-dial overlay).
//     Those controls become tap candidates even though a finger can't reach them.
//   - Controls under a tab bar or off the screen's edge still report visible: true (KotlinConf iOS 03 vote buttons,
//     the edit-menu arrow at x = -15 in KotlinConf iOS 05). No bounds check is made.
//   - System sheets out of process: the iOS photo picker is absent from the capture entirely (ReadMe 03); system
//     alerts replace the app's elements with SpringBoard's (NetNewsWire 01/09). Android permission prompts and ANR
//     dialogs are in the text but must never be answered by Jev (C17): `isPermissionDialog` spots permission prompts
//     so the step loop hands them to Claude without asking Jev; ANR dialogs are not spotted.
//   - Web content: WKWebView article bodies are not in the capture (NetNewsWire 04/05).
//   - Canvas text: map rooms and calendar event titles are drawn, not exposed (KotlinConf 07, KotlinConf Android 08,
//     Fossify 01/16).
//   - Tap-less targets: iOS table rows with only touch/longPress (NetNewsWire 02 smart feeds, 07 settings rows) are
//     not candidates; row swipes and coordinate taps are Claude-only (C19).
//   - State not in the text: switch states, selected tabs, selected filter options (KotlinConf 02/10).
import type { Action, Element, Platform } from '../contracts/index.js';

/** Jev's Choice takes at most 255 options. */
export const MAX_OPTIONS = 255;

/** A device action a candidate stands for: the `Action` kinds Jev may choose (never swipe or tapAt). */
export type CandidateAction = Extract<Action, { kind: 'tap' | 'type' | 'scroll' | 'back' }>;

/** What a chosen key means: an action to perform (with its element for tap and type), or one of the two answers
 *  that perform nothing. */
export type CandidateMeaning =
  | { kind: 'action'; action: CandidateAction; element?: Element }
  | { kind: 'step_done' }
  | { kind: 'none_fits' };

export interface Candidate {
  key: string;
  description: string;
}

export interface CandidateSet {
  candidates: Candidate[];
  /** Tap or type options dropped to stay within MAX_OPTIONS (document order kept). 0 on every spike capture. */
  dropped: number;
  /** Key -> meaning, for every candidate kept. Read it through `lookupCandidate`. */
  meanings: ReadonlyMap<string, CandidateMeaning>;
}

interface Built extends Candidate { meaning: CandidateMeaning }

const round = (n: number): number => Math.round(n);

function frameText(element: Element): string {
  const f = element.frame;
  return f ? ` at x ${round(f.x)}, y ${round(f.y)}, ${round(f.width)}x${round(f.height)}` : '';
}

/** The element as Jev reads it in the screen text: role, then label (or placeholder), value, identifier, frame. */
export function describeElement(element: Element): string {
  const parts: string[] = [element.role];
  if (element.placeholder !== undefined && !element.value) parts.push(`placeholder "${element.placeholder}"`);
  else if (element.label) parts.push(`"${element.label}"`);
  if (element.value) parts.push(`value "${element.value}"`);
  if (element.identifier) parts.push(`identifier "${element.identifier}"`);
  if (parts.length === 1) parts.push('(no label)');
  return parts.join(' ') + frameText(element);
}

function usable(element: Element): boolean {
  if (element.selectable === false) return false;
  if (element.state?.visible !== true || element.state.enabled !== true) return false;
  if (!element.frame || element.frame.width <= 0 || element.frame.height <= 0) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`)) return false;
  return true;
}

const FIXED: Built[] = [
  { key: 'scroll:up', description: 'Scroll toward the top to reveal content above the current view',
    meaning: { kind: 'action', action: { kind: 'scroll', direction: 'up' } } },
  { key: 'scroll:down', description: 'Scroll toward the bottom to reveal content below the current view',
    meaning: { kind: 'action', action: { kind: 'scroll', direction: 'down' } } },
  { key: 'back', description: 'Go back: the platform back action (Android Back key, iOS navigation back)',
    meaning: { kind: 'action', action: { kind: 'back' } } },
  { key: 'step_done', description: 'The current step is already done on this screen; no action is needed',
    meaning: { kind: 'step_done' } },
  { key: 'none_fits', description: 'None of these actions performs the current step; hand it back to Claude',
    meaning: { kind: 'none_fits' } },
];

/** Builds the options for one decision from a snapshot's elements and the value keys the step may type. */
export function buildCandidates(elements: readonly Element[], valueKeys: readonly string[] = []): CandidateSet {
  const seen = new Set<string>();
  // A ref seen twice would give two options one key: the first element keeps it.
  const live = elements.filter(e => usable(e) && !seen.has(e.ref) && seen.add(e.ref));
  const taps: Built[] = live.filter(e => e.actions.includes('tap')).map(e => ({
    key: `tap:${e.ref}`,
    description: `Tap the ${describeElement(e)}`,
    meaning: { kind: 'action', action: { kind: 'tap', targetRef: e.ref }, element: e },
  }));
  const keys = [...new Set(valueKeys)].sort();
  const types: Built[] = live.filter(e => e.actions.includes('typeText')).flatMap(e => keys.map((valueKey): Built => ({
    key: `type:${e.ref}:${valueKey}`,
    description: `Replace the text of the ${describeElement(e)} with the plan value ${valueKey}`,
    meaning: { kind: 'action', action: { kind: 'type', targetRef: e.ref, valueKey }, element: e },
  })));
  const room = MAX_OPTIONS - FIXED.length;
  const variable = [...types, ...taps]; // typed values first: a plan value must never be the one cut
  const kept = [...variable.slice(0, room), ...FIXED];
  return {
    candidates: kept.map(({ key, description }) => ({ key, description })),
    dropped: Math.max(0, variable.length - room),
    meanings: new Map(kept.map(({ key, meaning }) => [key, meaning])),
  };
}

/** Android's permission prompts come from the permission controller; every element on one carries its id prefix. */
const PERMISSION_CONTROLLER_IDS = ['com.android.permissioncontroller:', 'com.google.android.permissioncontroller:'];
/** The buttons of iOS's system permission alerts (notifications, paste, photos, tracking...), whole label. */
const PERMISSION_BUTTONS = new Set(['allow', "don't allow", 'allow once', 'allow while using app', 'allow full access',
  'allow paste', "don't allow paste", 'limit access...', 'ask app not to track']);

/** A label as the alert list holds it: trimmed, lower case, typographic apostrophe and ellipsis made plain. */
const alertLabel = (label: string): string => label.trim().toLowerCase().replace(/\u2019/g, "'").replace(/\u2026/g, '...');

/**
 * Whether the screen shows a system permission dialog, which Jev must never answer (C17): on Android, any element
 * from the permission controller; on iOS, a button labelled like a permission alert's ("Allow", "Don't Allow",
 * "Allow Once"...). An app's own button with one of those labels counts too: it goes to Claude, which is safe.
 */
export function isPermissionDialog(elements: readonly Element[], platform: Platform): boolean {
  if (platform === 'android') {
    return elements.some(({ identifier }) => identifier !== undefined && PERMISSION_CONTROLLER_IDS.some(id => identifier.startsWith(id)));
  }
  return elements.some(e => e.role === 'button' && e.label !== undefined && PERMISSION_BUTTONS.has(alertLabel(e.label)));
}

/** What a key Jev (or Claude) chose means in this set; undefined when the set never offered it. */
export function lookupCandidate(set: CandidateSet, key: string): CandidateMeaning | undefined {
  return set.meanings.get(key);
}
