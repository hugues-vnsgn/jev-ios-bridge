// Candidate actions for the jev-drives offline spike (ticket 03).
//
// Given one captured screen and one plan step, build the closed list of actions Jev may choose from:
//   tap:<ref>                 each visible, enabled, tap-capable element, described as Jev reads it
//   type:<ref>:<valueKey>     each typeable field x each value the plan supplied for this step (Jev never writes text)
//   scroll:up | scroll:down   reveal content above / below the current view
//   back                      leave this screen the way the platform's back does
//   step_done                 the current step is already done on this screen; no action needed
//   none_fits                 hand the step back to Claude
// The builder is deterministic: same capture + same step values -> same keys in the same order.
// It makes no Jev call and reads no key.
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
//     dialogs are in the text but must never be answered by Jev (C17).
//   - Web content: WKWebView article bodies are not in the capture (NetNewsWire 04/05).
//   - Canvas text: map rooms and calendar event titles are drawn, not exposed (KotlinConf 07, KotlinConf Android 08,
//     Fossify 01/16).
//   - Tap-less targets: iOS table rows with only touch/longPress (NetNewsWire 02 smart feeds, 07 settings rows) are
//     not candidates; row swipes and coordinate taps are Claude-only (C19).
//   - State not in the text: switch states, selected tabs, selected filter options (KotlinConf 02/10, BFSOne 02/04).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Element, Platform } from '../../src/contracts/index.js';
import { parseSnapshot } from '../../src/device/index.js';

/** Jev's Choice takes at most 255 options. */
export const MAX_OPTIONS = 255;
const FIXED_KEYS = ['scroll:up', 'scroll:down', 'back', 'step_done', 'none_fits'] as const;

export interface StepInput {
  /** Values the plan supplies for this step, by key. Only these can be typed. */
  values?: Record<string, string>;
}

export interface Candidate {
  key: string;
  description: string;
}

export interface CandidateSet {
  candidates: Candidate[];
  /** Tap or type options dropped to stay within MAX_OPTIONS (document order kept). 0 on every spike capture. */
  dropped: number;
}

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
  if (element.state?.visible !== true || element.state.enabled !== true) return false;
  if (!element.frame || element.frame.width <= 0 || element.frame.height <= 0) return false;
  if (/status.?bar/i.test(`${element.role} ${element.identifier ?? ''}`)) return false;
  return true;
}

export function buildCandidates(elements: Element[], step: StepInput = {}): CandidateSet {
  const live = elements.filter(usable);
  const taps: Candidate[] = live.filter(e => e.actions.includes('tap'))
    .map(e => ({ key: `tap:${e.ref}`, description: `Tap the ${describeElement(e)}` }));
  const valueKeys = Object.keys(step.values ?? {}).sort();
  const types: Candidate[] = live.filter(e => e.actions.includes('typeText')).flatMap(e => valueKeys.map(valueKey => ({
    key: `type:${e.ref}:${valueKey}`,
    description: `Replace the text of the ${describeElement(e)} with the plan value ${valueKey} ("${step.values![valueKey]}")`,
  })));
  const fixed: Candidate[] = [
    { key: 'scroll:up', description: 'Scroll toward the top to reveal content above the current view' },
    { key: 'scroll:down', description: 'Scroll toward the bottom to reveal content below the current view' },
    { key: 'back', description: 'Go back: the platform back action (Android Back key, iOS navigation back)' },
    { key: 'step_done', description: 'The current step is already done on this screen; no action is needed' },
    { key: 'none_fits', description: 'None of these actions performs the current step; hand it back to Claude' },
  ];
  const room = MAX_OPTIONS - fixed.length;
  const variable = [...types, ...taps]; // typed values first: a plan value must never be the one cut
  const kept = variable.slice(0, room);
  return { candidates: [...kept, ...fixed], dropped: variable.length - kept.length };
}

/** iOS: the bridge's own parse of the pinned MobileBuildMCP full snapshot. Refs are the vendor's (e1, e2, ...). */
export function loadIosCapture(dir: string): Element[] {
  const envelope = JSON.parse(readFileSync(join(dir, 'snapshot.full.json'), 'utf8'));
  return parseSnapshot(envelope.data, 'spike').elements;
}

const ANDROID_TAPPABLE = new Set(['button', 'switch', 'text-field']);

/**
 * Android: the capture JSON lines exactly as Jev reads them (`capture-jev.txt`, frames included). Refs are
 * `a<line>` (1-based, header excluded), stable for this capture file. The capture drops the element's action
 * list, so it is restored by the Android mapping's own rule (`src/device/android/mapping.ts`): clickable nodes
 * become buttons, and buttons, switches and text fields can be tapped; text fields can be typed into.
 */
export function loadAndroidCapture(dir: string): Element[] {
  const lines = readFileSync(join(dir, 'capture-jev.txt'), 'utf8').split('\n').slice(1).filter(Boolean);
  return lines.map((line, index) => {
    const raw = JSON.parse(line) as Omit<Element, 'ref' | 'actions'>;
    const actions = [
      ...(ANDROID_TAPPABLE.has(raw.role) ? ['tap'] : []),
      ...(raw.role === 'text-field' ? ['typeText'] : []),
      ...(raw.role === 'scroll-view' ? ['swipeWithin'] : []),
    ];
    return { ...raw, ref: `a${index + 1}`, actions };
  });
}

export function loadCapture(dir: string, platform: Platform): Element[] {
  return platform === 'ios' ? loadIosCapture(dir) : loadAndroidCapture(dir);
}

export const FIXED_CANDIDATE_KEYS = FIXED_KEYS;
