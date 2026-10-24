import type { Element, Snapshot } from '../../contracts/index.js';
import { DeviceReasonError } from '../../device/index.js';
import type { AppiumPlatform, locatorSchema } from '../wire-schemas.js';
import type { z } from 'zod/v4';

export type Locator = z.infer<typeof locatorSchema>;
export interface TextField { locator: Locator; matches(element: Element): boolean }

const IOS_TEXT_TYPES = ['XCUIElementTypeTextField', 'XCUIElementTypeSecureTextField', 'XCUIElementTypeTextView'];
const quote = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const sameFrame = (a: Element['frame'], b: Element['frame']) =>
  a !== undefined && b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

function ambiguous(): never {
  throw new DeviceReasonError('TARGET_AMBIGUOUS', 'The text field cannot be told apart from another element on the screen.');
}

/**
 * The bridge's locator for one text field, and the rule that finds the same field again in a later capture.
 * It refuses, before any input, a field that the snapshot cannot single out.
 */
export function textFieldOf(platform: AppiumPlatform, snapshot: Snapshot, target: Element): TextField {
  let field: TextField;
  if (platform === 'ios') {
    const name = target.identifier ?? target.label;
    if (!name) return ambiguous();
    field = { locator: { using: '-ios predicate string', value: `type IN {${IOS_TEXT_TYPES.map(quote).join(', ')}} AND name == ${quote(name)}` },
      matches: element => element.role === 'text-field' && (element.identifier ?? element.label) === name };
  } else if (target.identifier) {
    const id = target.identifier;
    field = { locator: { using: 'id', value: id }, matches: element => element.identifier === id };
  } else {
    const frame = target.frame;
    if (!frame) return ambiguous();
    const bounds = `[${String(frame.x)},${String(frame.y)}][${String(frame.x + frame.width)},${String(frame.y + frame.height)}]`;
    field = { locator: { using: 'xpath', value: `//*[@bounds=${quote(bounds)} and (contains(@class,"EditText") or contains(@class,"AutoCompleteTextView"))]` },
      matches: element => element.role === 'text-field' && sameFrame(element.frame, frame) };
  }
  if (snapshot.elements.filter(field.matches).length !== 1) return ambiguous();
  return field;
}

/**
 * The field's own value in a fresh capture. An empty field that shows only its hint has no value. Undefined
 * when the capture does not single the field out, so the step then records no shown value.
 */
export function shownValueOf(field: TextField, target: Element, fresh: Snapshot): string | undefined {
  const only = (matches: Element[]) => matches.length === 1 ? matches[0] : undefined;
  const found = only(fresh.elements.filter(field.matches))
    ?? only(fresh.elements.filter(element => element.role === 'text-field' && sameFrame(element.frame, target.frame)));
  if (!found) return undefined;
  return found.value === undefined || found.value === found.placeholder ? '' : found.value;
}
