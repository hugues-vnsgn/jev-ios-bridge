// Screenshot sizes, read from the image file's header: `tapAt` coordinates are pixels of the screenshot.
import { readFile } from 'node:fs/promises';
import type { Size } from './index.js';

/**
 * A JPEG's width and height, from its first frame header (any SOF marker), or undefined when the bytes aren't a
 * JPEG with one. The agent's screenshot is shrunk to at most 800 px, so `tapAt` needs its size to scale a point.
 */
export function jpegSize(jpeg: Buffer): Size | undefined {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return undefined;
  let at = 2;
  while (at + 4 <= jpeg.length) {
    if (jpeg[at] !== 0xff) return undefined;
    const marker = jpeg[at + 1]!;
    // Fill bytes before a marker, and the markers that carry no length.
    if (marker === 0xff) { at++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { at += 2; continue; }
    const length = jpeg.readUInt16BE(at + 2);
    // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), hold the frame's height then width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > jpeg.length) return undefined;
      const height = jpeg.readUInt16BE(at + 5);
      const width = jpeg.readUInt16BE(at + 7);
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    if (marker === 0xda || length < 2) return undefined;
    at += 2 + length;
  }
  return undefined;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A PNG's or JPEG's width and height, or undefined when the file can't be read as either. */
export async function imageSize(path: string): Promise<Size | undefined> {
  let bytes: Buffer;
  try { bytes = await readFile(path); }
  catch { return undefined; }
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  }
  return jpegSize(bytes);
}
