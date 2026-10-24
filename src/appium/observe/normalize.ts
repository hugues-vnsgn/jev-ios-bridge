import { createHash } from 'node:crypto';
import type { Element, Platform } from '../../contracts/index.js';
import type { Role } from '../../scripted/vocabulary.js';
import type { AndroidNode } from '../../device/android/agent-client.js';
import { mapAndroidTree } from '../../device/android/mapping.js';
import { SOURCE_SETTINGS } from '../wire-schemas.js';
import { parseSource, ObservationIncompleteError, type SourceNode } from './xml.js';
export { ObservationIncompleteError } from './xml.js';

function invalid(): never { throw new ObservationIncompleteError('invalid-source'); }
function boolean(node: SourceNode, key: string, required = false): boolean | undefined {
  const value = node.attributes[key];
  if (value === undefined && !required) return undefined;
  return value === 'true' ? true : value === 'false' ? false : invalid();
}
function numeric(node: SourceNode, key: string): number {
  const value = node.attributes[key];
  if (value === undefined || !/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return invalid();
  const result = Number(value);
  return Number.isFinite(result) ? result : invalid();
}
function androidNode(node: SourceNode): AndroidNode {
  const a = node.attributes;
  if (node.name !== 'node' && node.name !== a.class) invalid();
  if (!a.class) invalid();
  const bounds = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(a.bounds ?? '');
  if (!bounds) return invalid();
  const x = Number(bounds[1]), y = Number(bounds[2]), right = Number(bounds[3]), bottom = Number(bounds[4]);
  if (![x, y, right, bottom].every(Number.isSafeInteger)) invalid();
  const result: AndroidNode = { class: a.class, enabled: boolean(node, 'enabled', true)!, visible: boolean(node, 'displayed', true)!,
    rect: { x, y, width: right - x, height: bottom - y }, children: node.children.map(androidNode) };
  for (const key of ['text', 'hint', 'content-desc', 'resource-id'] as const) if (a[key] !== undefined) result[key] = a[key];
  for (const key of ['checkable', 'checked', 'clickable', 'focused', 'selected', 'scrollable', 'password'] as const) {
    const value = boolean(node, key, true);
    if (value !== undefined) result[key] = value;
  }
  return result;
}
const iosRoles: Readonly<Record<string, Role>> = {
  Application: 'application', Window: 'window', Button: 'button', Key: 'keyboard-key', TextField: 'text-field',
  SecureTextField: 'text-field', TextView: 'text-field', Menu: 'menu', StaticText: 'text', Image: 'image',
  Switch: 'switch', Slider: 'slider', Cell: 'cell', ScrollView: 'scroll-view', Table: 'list', CollectionView: 'list', Tab: 'tab',
};
const tappable = new Set<Role>(['button', 'keyboard-key', 'switch', 'text-field', 'cell', 'tab']);
const inputRoles = new Set<Role>(['text-field', 'switch', 'slider']);
function accessibilityValue(role: Role, a: Record<string, string>): string | undefined {
  const value = a.value;
  if (!value) return undefined;
  if (!inputRoles.has(role) && (value === a.label || value === a.name)) return undefined;
  if (role === 'button' && (value === '0' || value === '1')) return undefined;
  return value;
}
function iosElements(root: SourceNode): Element[] {
  const elements: Element[] = [];
  const visit = (node: SourceNode): void => {
    const a = node.attributes;
    if (!node.name.startsWith('XCUIElementType') || a.type !== node.name) invalid();
    const kind = node.name.slice('XCUIElementType'.length);
    if (kind === 'StatusBar') return;
    const role = iosRoles[kind] ?? 'other';
    const enabled = boolean(node, 'enabled', true)!, visible = boolean(node, 'visible', true)!;
    const focused = boolean(node, 'focused');
    const frame = { x: numeric(node, 'x'), y: numeric(node, 'y'), width: numeric(node, 'width'), height: numeric(node, 'height') };
    const actions: string[] = [];
    if (enabled) {
      if (tappable.has(role)) actions.push('tap');
      if (role !== 'application' && role !== 'window') actions.push('longPress', 'touch');
      if (role === 'text-field') actions.push('typeText');
      if (role === 'scroll-view' || role === 'list') actions.push('swipeWithin');
    }
    const element: Element = { ref: `e${elements.length + 1}`, role, actions,
      state: { enabled, visible, ...(focused === undefined ? {} : { focused }) }, frame };
    if (a.label) element.label = a.label;
    if (a.name && a.name !== a.label) element.identifier = a.name;
    if (a.placeholder) element.placeholder = a.placeholder;
    const value = accessibilityValue(role, a);
    if (value !== undefined) element.value = kind === 'SecureTextField' ? value.replace(/[^•●*]/gu, '•') : value;
    elements.push(element);
    node.children.forEach(visit);
  };
  root.children.forEach(visit);
  return elements;
}

export interface NormalizedCapture { elements: Element[]; truncated: false; screenHash: string }
export function normalizeSource(platform: Platform, xml: string): NormalizedCapture {
  const root = parseSource(xml, SOURCE_SETTINGS[platform].snapshotMaxDepth);
  if (root.name !== (platform === 'ios' ? 'AppiumAUT' : 'hierarchy') || root.children.length === 0) invalid();
  const elements = platform === 'ios' ? iosElements(root) : mapAndroidTree({ hierarchy: root.children.map(androidNode) });
  return { elements, truncated: false, screenHash: snapshotHash(elements) };
}

export function snapshotHash(elements: Element[]): string {
  return createHash('sha256').update(JSON.stringify(elements.map(({ ref, ...evidence }) => evidence))).digest('hex');
}
