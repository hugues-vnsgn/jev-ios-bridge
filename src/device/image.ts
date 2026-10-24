import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod/v4';
import { StackError, type VerifiedStack } from '../appium/stack.js';
import { screenResultSchema, type ExtensionResult } from '../appium/wire-schemas.js';

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


const dependencySchema = z.object({ dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional() });
function verifyImageCodec(stack: VerifiedStack): string {
  function mismatch(): never { throw new StackError('STACK_FILE_MISMATCH', 'The frozen image codec differs.'); }
  if (resolve(stack.nodeModules) !== join(resolve(stack.root), 'node_modules')) mismatch();
  const packages = new Map(stack.manifest.packages.map(pkg => [pkg.path, pkg]));
  const verified = new Set<string>();
  const check = (path: string): void => {
    const entry = stack.manifest.files[path];
    if (!entry || entry.kind !== 'file') mismatch();
    for (let parent = dirname(path); parent !== '.'; parent = dirname(parent))
      if (!lstatSync(join(stack.root, parent)).isDirectory()) mismatch();
    const full = join(stack.root, path);
    if (!lstatSync(full).isFile() || createHash('sha256').update(readFileSync(full)).digest('hex') !== entry.sha256) mismatch();
  };
  const dependency = (from: string, name: string): string | undefined => {
    let prefix = from;
    while (true) {
      const path = `${prefix}/node_modules/${name}`;
      if (packages.has(path)) return path;
      const at = prefix.lastIndexOf('/node_modules/');
      if (at === -1) return packages.has(`node_modules/${name}`) ? `node_modules/${name}` : undefined;
      prefix = prefix.slice(0, at);
    }
  };
  const visit = (path: string): void => {
    if (verified.has(path)) return;
    if (!packages.has(path)) mismatch();
    verified.add(path);
    check(path + '/package.json');
    const metadata = dependencySchema.parse(JSON.parse(readFileSync(join(stack.root, path, 'package.json'), 'utf8')));
    const actual = new Set<string>();
    const walk = (directory: string): void => {
      for (const item of readdirSync(join(stack.root, directory), { withFileTypes: true })) {
        const next = `${directory}/${item.name}`;
        if (item.isDirectory()) walk(next);
        else { actual.add(next); check(next); }
      }
    };
    walk(path);
    const expected = Object.keys(stack.manifest.files).filter(file => file.startsWith(path + '/'));
    if (actual.size !== expected.length || expected.some(file => !actual.has(file))) mismatch();
    for (const name of Object.keys(metadata.dependencies ?? {})) {
      const selected = dependency(path, name);
      if (!selected) mismatch();
      visit(selected);
    }
    for (const name of Object.keys(metadata.optionalDependencies ?? {})) {
      const selected = dependency(path, name);
      if (selected) visit(selected);
    }
  };
  try { visit('node_modules/sharp'); }
  catch (error) { if (error instanceof StackError) throw error; mismatch(); }
  const native = (name: string) => [...verified].some(path => path.endsWith(`node_modules/@img/${name}`));
  const host = [`${process.platform}-${process.arch}`, `${process.platform}musl-${process.arch}`];
  if (!host.some(target => native(`sharp-${target}`) && native(`sharp-libvips-${target}`))) mismatch();
  return join(stack.nodeModules, 'sharp');
}

const callable = z.custom<(...args: unknown[]) => unknown>(value => typeof value === 'function');
const object = z.custom<object>(value => value !== null && typeof value === 'object');
function codecCall(receiver: unknown, method: string, ...args: unknown[]): unknown {
  const target = object.parse(receiver);
  return callable.parse(Reflect.get(target, method)).apply(target, args);
}
export interface ScreenshotImage {
  jpeg: Buffer;
  size: Size;
  frame: ExtensionResult<'jev_screen'>['rect'];
  orientation: ExtensionResult<'jev_screen'>['orientation'];
}
export class ScreenshotError extends Error {
  readonly code = 'INVALID_SCREENSHOT';
  constructor() { super('The screen image is invalid.'); }
}

const codecs = new Map<string, z.infer<typeof callable>>();
function imageCodec(stack: VerifiedStack): z.infer<typeof callable> {
  const root = resolve(stack.root);
  let factory = codecs.get(root);
  if (!factory) {
    const path = verifyImageCodec(stack);
    factory = callable.parse(createRequire(join(stack.root, 'package.json'))(path));
    codecs.set(root, factory);
  }
  return factory;
}

/**
 * The window frame and the JPEG's own size travel together and are never compared here: an Android window can
 * exclude the navigation bar. Android `tapAt` refuses when the screenshot it converts is inconsistent with its frame.
 */
export function createScreenshotEncoder(stack: VerifiedStack): (screen: ExtensionResult<'jev_screen'>) => Promise<ScreenshotImage> {
  const factory = imageCodec(stack);
  return async input => {
    try {
      const screen = screenResultSchema.parse(input);
      const bytes = Buffer.from(screen.pngBase64, 'base64');
      if (bytes.length > 10 * 1024 * 1024) throw new ScreenshotError();
      const image = factory(bytes, { failOn: 'warning', limitInputPixels: 64 * 1024 * 1024 });
      const metadata = z.object({ format: z.literal('png'), width: z.number().int().positive(), height: z.number().int().positive(),
        pages: z.number().int().optional(), orientation: z.number().optional() }).parse(await codecCall(image, 'metadata'));
      if ((metadata.pages ?? 1) !== 1 || (metadata.orientation ?? 1) !== 1) throw new ScreenshotError();
      const { width, height } = metadata;
      if (width !== height && (width > height) !== (screen.orientation === 'LANDSCAPE')) throw new ScreenshotError();
      if (screen.rect.width !== screen.rect.height && (screen.rect.width > screen.rect.height) !== (width > height)) throw new ScreenshotError();
      codecCall(image, 'resize', { width: 800, height: 800, fit: 'inside', withoutEnlargement: true });
      codecCall(image, 'jpeg', { quality: 80 });
      const jpeg = z.instanceof(Buffer).parse(await codecCall(image, 'toBuffer'));
      const size = jpegSize(jpeg);
      if (!size || Math.max(size.width, size.height) > Math.min(800, Math.max(width, height)) || jpeg.length > 10 * 1024 * 1024) throw new ScreenshotError();
      return { jpeg, size, frame: { ...screen.rect }, orientation: screen.orientation };
    } catch { throw new ScreenshotError(); }
  };
}
