import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Element, Snapshot } from '../src/contracts/index.js';
import { backButtonOf, largestScrollable, scrollFinger } from '../src/device/index.js';

const frame = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const visible = { enabled: true, visible: true };
/** A 440 × 956 point screen: the application element, then `elements`. */
const screenOf = (...elements: Omit<Element, 'actions'>[]): Snapshot => ({ deviceId: 'sim', capturedAt: 0, expiresAt: 60_000, sequence: 1, truncated: false,
  elements: [{ ref: 'e1', role: 'application', label: 'Example', frame: frame(0, 0, 440, 956), state: visible, actions: [] },
    ...elements.map(element => ({ state: visible, ...element,
      actions: element.role === 'scroll-view' ? ['swipeWithin'] : element.role === 'button' ? ['tap', 'longPress', 'touch'] : [] }))] });

test('back targets the navigation bar\'s BackButton before any back-labelled button', () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Back', frame: frame(8, 62, 60, 44) },
    { ref: 'e3', role: 'button', label: 'Settings', identifier: 'BackButton', frame: frame(16, 62, 100, 44) },
  );
  assert.equal(backButtonOf(screen)?.ref, 'e3');
});

test('without a BackButton, back targets the leftmost back-labelled button in the top bar, never one lower on the screen', () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Back', frame: frame(150, 500, 36, 36) },
    { ref: 'e3', role: 'button', label: 'Back to list', frame: frame(120, 60, 120, 44) },
    { ref: 'e4', role: 'button', label: 'back', frame: frame(8, 60, 60, 44) },
  );
  assert.equal(backButtonOf(screen)?.ref, 'e4');
});

test('with no back button in the top bar there is no target, so back swipes in from the edge', () => {
  const screen = screenOf(
    { ref: 'e2', role: 'button', label: 'Back', frame: frame(150, 500, 36, 36) },
    { ref: 'e3', role: 'button', label: 'Done', frame: frame(16, 62, 60, 44) },
  );
  assert.equal(backButtonOf(screen), undefined);
});

test('scroll strokes inside the largest scroll view, the finger moving against the scroll\'s direction', () => {
  const screen = screenOf(
    { ref: 'e2', role: 'scroll-view', frame: frame(0, 100, 440, 200) },
    { ref: 'e3', role: 'scroll-view', frame: frame(0, 320, 440, 600) },
  );
  assert.equal(largestScrollable(screen.elements)?.ref, 'e3');
  assert.equal(largestScrollable(screenOf({ ref: 'e2', role: 'button', label: 'Done', frame: frame(16, 62, 60, 44) }).elements), undefined);
  assert.deepEqual([scrollFinger('down'), scrollFinger('up')], ['up', 'down']);
});
