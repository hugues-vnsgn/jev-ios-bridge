import type { Element } from '../../contracts/index.js';

type Frame = NonNullable<Element['frame']>;

/** WindowManagerService's own words when no window title matches the name dumped (API 31 to 36). */
const NO_WINDOW = /^Bad window command, or no windows match: InputMethod$/m;
/** An input-method window's header; one animating out ends ` EXITING}` and can still take touches. */
const HEADER = /^ *Window #\d+ Window\{[0-9a-f]+ u\d+ InputMethod(?: EXITING)?\}:$/gm;

/**
 * The screen areas where the soft keyboard takes touches, from `dumpsys window InputMethod`: the window manager's touchable
 * region for each input-method window, already in screen coordinates (read on API 36: the IME's own region shifted by its
 * window's top). Empty only when the window manager says no such window exists, or every one is not visible; undefined
 * whenever the dump does not say, so the caller refuses rather than touch a keyboard it could not see.
 */
export function keyboardAreas(dump: string): Frame[] | undefined {
  const headers = [...dump.matchAll(HEADER)];
  if (!headers.length) return NO_WINDOW.test(dump) ? [] : undefined;
  const areas: Frame[] = [];
  for (const header of headers) {
    const rest = dump.slice(header.index + header[0].length);
    const section = rest.slice(0, /^ *Window #\d+ /m.exec(rest)?.index ?? rest.length);
    const visible = /^ *isVisible=(true|false)$/m.exec(section)?.[1];
    if (visible === 'false') continue;
    const region = /^ *touchable region=SkRegion\(((?:\(-?\d+,-?\d+,-?\d+,-?\d+\))*)\)$/m.exec(section)?.[1];
    if (visible === undefined || region === undefined) return undefined;
    areas.push(...[...region.matchAll(/\((-?\d+),(-?\d+),(-?\d+),(-?\d+)\)/g)].map(([, left, top, right, bottom]) =>
      ({ x: Number(left), y: Number(top), width: Number(right) - Number(left), height: Number(bottom) - Number(top) })));
  }
  return areas;
}
