import type { Element } from '../../contracts/index.js';

type Frame = NonNullable<Element['frame']>;

/**
 * The screen areas where the soft keyboard takes touches, from `dumpsys window InputMethod`: the window manager's touchable
 * region for the input-method window, already in screen coordinates (read on API 36: the IME's own region shifted by its
 * window's top). Empty when there is no such window or it is not visible; undefined when the window is there but its
 * visibility or region can't be read.
 */
export function keyboardAreas(dump: string): Frame[] | undefined {
  const start = /^ *Window #\d+ Window\{[0-9a-f]+ u\d+ InputMethod\}:$/m.exec(dump);
  if (!start) return [];
  const rest = dump.slice(start.index + start[0].length);
  const section = rest.slice(0, /^ *Window #\d+ /m.exec(rest)?.index ?? rest.length);
  const visible = /^ *isVisible=(true|false)$/m.exec(section)?.[1];
  if (visible === 'false') return [];
  const region = /^ *touchable region=SkRegion\(((?:\(-?\d+,-?\d+,-?\d+,-?\d+\))*)\)$/m.exec(section)?.[1];
  if (visible === undefined || region === undefined) return undefined;
  return [...region.matchAll(/\((-?\d+),(-?\d+),(-?\d+),(-?\d+)\)/g)].map(([, left, top, right, bottom]) =>
    ({ x: Number(left), y: Number(top), width: Number(right) - Number(left), height: Number(bottom) - Number(top) }));
}
