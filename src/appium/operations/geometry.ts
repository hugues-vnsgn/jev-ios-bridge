import type { Direction, Element } from '../../contracts/index.js';
import { screenMiddleSwipe, type Size } from '../../device/index.js';
import type { z } from 'zod/v4';
import type { actionsRequestSchema, AppiumPlatform } from '../wire-schemas.js';

export type PointerActions = z.input<typeof actionsRequestSchema>['actions'];
export type Point = { x: number; y: number };
export type Frame = NonNullable<Element['frame']>;
export type Stroke = { from: Point; to: Point; durationMs: number };

export const DEFAULT_TAP_HOLD_MS = 50;
const SWIPE_MS = 1000;
const IOS_SCREEN_SCROLL_MS = 500;
const IOS_EDGE_BACK_MS = 300;
const IOS_SCROLL_DISTANCE = 0.4;
const IOS_SCREEN_SCROLL_HALF = 100;
const IOS_EDGE_INSET = 20;

const pointer = (actions: PointerActions[number]['actions']): PointerActions =>
  [{ type: 'pointer', id: 'finger1', parameters: { pointerType: 'touch' }, actions }];
const move = (point: Point, duration = 0) => ({ type: 'pointerMove' as const, duration, origin: 'viewport', x: point.x, y: point.y });
const press = { type: 'pointerDown' as const, button: 0 };
const release = { type: 'pointerUp' as const, button: 0 };

export function tapSequence(point: Point, holdMs: number): PointerActions {
  return pointer([move(point), press, { type: 'pause', duration: holdMs }, release]);
}
export function strokeSequence({ from, to, durationMs }: Stroke): PointerActions {
  return pointer([move(from), press, move(to, durationMs), release]);
}

export function centreOf(frame: Frame): Point {
  return { x: Math.round(frame.x + frame.width / 2), y: Math.round(frame.y + frame.height / 2) };
}

type Axis = { start: number; length: number };
const fraction = ({ start, length }: Axis, from: number, to: number): [number, number] =>
  [Math.round(start + length * from), Math.round(start + length * to)];

/** The span MobileBuildMCP strokes inside an element: 15% insets of at least 24 points, never past a third. */
function iosSpan({ start, length }: Axis): [number, number] {
  const inset = Math.max(1, Math.min(Math.max(length * 0.15, 24), length / 3));
  return [Math.round(start + inset), Math.round(start + length - inset)];
}
function iosStroke(axis: Axis, forward: boolean, distance: number): [number, number] {
  const [low, high] = iosSpan(axis);
  const middle = (low + high) / 2;
  const half = (high - low) * distance / 2;
  return forward ? [Math.round(middle - half), Math.round(middle + half)] : [Math.round(middle + half), Math.round(middle - half)];
}

/** The finger's stroke within an element along its centre line. `direction` is the finger's own. */
export function swipeWithin(platform: AppiumPlatform, frame: Frame, direction: Direction, distance = 1): Stroke {
  const centre = centreOf(frame);
  const vertical = direction === 'up' || direction === 'down';
  const axis = vertical ? { start: frame.y, length: frame.height } : { start: frame.x, length: frame.width };
  const forward = direction === 'down' || direction === 'right';
  const [from, to] = platform === 'android' ? fraction(axis, forward ? 0.1 : 0.9, forward ? 0.9 : 0.1) : iosStroke(axis, forward, distance);
  return { from: vertical ? { x: centre.x, y: from } : { x: from, y: centre.y }, to: vertical ? { x: centre.x, y: to } : { x: to, y: centre.y },
    durationMs: SWIPE_MS };
}

/** The scroll inside the largest scrollable: today's Android stroke, and the iOS stroke MobileBuildMCP made at distance 0.4. */
export function scrollWithin(platform: AppiumPlatform, frame: Frame, finger: 'up' | 'down'): Stroke {
  return swipeWithin(platform, frame, finger, platform === 'ios' ? IOS_SCROLL_DISTANCE : 1);
}

/** The scroll with no scrollable: down the screen's middle. `direction` is the content's, as `scroll` carries it. */
export function screenMiddleScroll(platform: AppiumPlatform, screen: Size, direction: 'up' | 'down'): Stroke {
  if (platform === 'android') {
    const { x1, y1, x2, y2 } = screenMiddleSwipe(screen, direction);
    return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, durationMs: SWIPE_MS };
  }
  const x = Math.round(screen.width / 2);
  const centre = screen.height / 2;
  const [from, to] = direction === 'down' ? [centre + IOS_SCREEN_SCROLL_HALF, centre - IOS_SCREEN_SCROLL_HALF] : [centre - IOS_SCREEN_SCROLL_HALF, centre + IOS_SCREEN_SCROLL_HALF];
  return { from: { x, y: Math.round(from) }, to: { x, y: Math.round(to) }, durationMs: IOS_SCREEN_SCROLL_MS };
}

/** AXe's left-edge back stroke. */
export function edgeBack(screen: Size): Stroke {
  const y = Math.round(screen.height / 2);
  return { from: { x: IOS_EDGE_INSET, y }, to: { x: Math.round(screen.width - IOS_EDGE_INSET), y }, durationMs: IOS_EDGE_BACK_MS };
}
