import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { test } from 'node:test';
import sharp from '../.scratch/appium-mcp-migration/candidate-stack/node_modules/sharp/dist/index.cjs';
import { createScreenshotEncoder, jpegSize } from '../src/device/image.js';
import { imageStack } from './fixtures/appium-wire/image-stack.js';
import { screenResultSchema } from '../src/appium/wire-schemas.js';
async function screen(width: number, height: number) {
  const png = await sharp({ create: { width, height, channels: 3, background: 'red' } }).png().toBuffer();
  return screenResultSchema.parse({ extensionVersion: 1, sessionId: 'ios-session', pngBase64: png.toString('base64'),
    rect: { x: 7, y: 9, width, height }, orientation: width > height ? 'LANDSCAPE' : 'PORTRAIT' });
}
test('real PNG pixels become a decodable JPEG at most 800 px with its source frame retained', async t => {
  const { stack } = imageStack(t); const encode = createScreenshotEncoder(stack);
  const result = await encode(await screen(1200, 2400));
  assert.deepEqual(jpegSize(result.jpeg), { width: 400, height: 800 });
  assert.deepEqual(result.size, { width: 400, height: 800 });
  assert.deepEqual(result.frame, { x: 7, y: 9, width: 1200, height: 2400 });
  const decoded = await sharp(result.jpeg).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([decoded.info.width, decoded.info.height, decoded.info.channels], [400, 800, 3]);
  assert.ok(decoded.data[0]! > 240 && decoded.data[1]! < 10 && decoded.data[2]! < 10);
  assert.deepEqual((await encode(await screen(320, 160))).size, { width: 320, height: 160 });
});
test('malformed PNG content and a mismatched screen orientation refuse', async t => {
  const { stack } = imageStack(t); const encode = createScreenshotEncoder(stack); const input = await screen(100, 200);
  await assert.rejects(encode({ ...input, pngBase64: Buffer.from('broken').toString('base64') }), { code: 'INVALID_SCREENSHOT' });
  await assert.rejects(encode({ ...input, orientation: 'LANDSCAPE' }), { code: 'INVALID_SCREENSHOT' });
  assert.deepEqual((await encode(input)).size, { width: 100, height: 200 });
});
test('a tampered sharp native binary refuses before the codec loads even when omitted from the loaded set', t => {
  const { stack, binary } = imageStack(t); appendFileSync(binary, 'tampered');
  assert.throws(() => createScreenshotEncoder(stack), { code: 'STACK_FILE_MISMATCH' });
});
test('a screenshot whose ratio differs from the window rect is kept with both sizes for tapAt to judge', async t => {
  const { stack } = imageStack(t); const encode = createScreenshotEncoder(stack);
  const input = await screen(1080, 2400);
  const result = await encode({ ...input, rect: { x: 0, y: 0, width: 1080, height: 2274 } });
  assert.deepEqual(result.size, { width: 360, height: 800 });
  assert.deepEqual(result.frame, { x: 0, y: 0, width: 1080, height: 2274 });
});
for (const [missing, omit] of [['platform', (name: string) => /^@img\/sharp-(?!libvips-)/.test(name)], ['libvips', (name: string) => name.startsWith('@img/sharp-libvips-')]] as const) {
  test(`a missing sharp ${missing} package refuses before the codec loads`, t => {
    const { stack } = imageStack(t, omit);
    assert.throws(() => createScreenshotEncoder(stack), { code: 'STACK_FILE_MISMATCH' });
  });
}
test('the codec is verified once per stack root, since a loaded native module cannot change in process', t => {
  const { stack, binary } = imageStack(t);
  createScreenshotEncoder(stack);
  appendFileSync(binary, 'tampered');
  assert.equal(typeof createScreenshotEncoder(stack), 'function');
});
