import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExtensionHandler } from '../src/appium/extension/operations.js';
import { SOURCE_SETTINGS } from '../src/appium/wire-schemas.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1sAAAAASUVORK5CYII=';
const base = { extensionVersion: 1, sessionId: 'session-1' };
const success = { content: [{ type: 'text', text: 'Acknowledged.' }], isError: false,
  structuredContent: { ...base, acknowledged: true } };
function fixture(platform: 'ios' | 'android' = 'ios') {
  const calls: unknown[][] = [];
  const record = (name: string, value: unknown) => async (...args: unknown[]) => { calls.push([name, ...args]); return value; };
  const driver = {
    findElements: record('findElements', [{ ELEMENT: 'field-1' }]), clear: record('clear', null), setValue: record('setValue', null),
    execute: record('execute', null), pressKeyCode: record('pressKeyCode', null), terminateApp: record('terminateApp', true),
    getScreenshot: record('getScreenshot', png), getWindowRect: record('getWindowRect', { x: 0, y: 0, width: 390, height: 844 }),
    getOrientation: record('getOrientation', 'LANDSCAPE'), proxyCommand: record('proxyCommand', 'PORTRAIT'),
    updateSettings: record('updateSettings', null), getSettings: record('getSettings', SOURCE_SETTINGS[platform]),
  };
  const handler = createExtensionHandler({ platform, device: 'device-1',
    getSession: id => id === 'session-1' ? { ownership: 'owned', platform, device: 'device-1', driver } : null });
  return { handler, driver, calls };
}
const locator = { using: 'accessibility id', value: 'username' };
const error = (code: string) => ({ content: [{ type: 'text', text: code }], isError: true, structuredContent: { error: { code, message: code } } });

test('iOS replacement resolves one field, clears once, then sets once without returning the typed value', async () => {
  const f = fixture();
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: 'private-test-value' }), success);
  assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username'], ['clear', 'field-1'], ['setValue', 'private-test-value', 'field-1']]);
});
test('Android replacement is one mobile replaceElementValue command', async () => {
  const f = fixture('android');
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: 'replacement' }), success);
  assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username'], ['execute', 'mobile: replaceElementValue', [{ elementId: 'field-1', text: 'replacement' }]]]);
});
test('iOS empty replacement clears once and never calls setValue', async () => {
  const f = fixture();
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: '' }), success);
  assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username'], ['clear', 'field-1']]);
});
test('Android empty replacement is one replaceElementValue with empty text', async () => {
  const f = fixture('android');
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: '' }), success);
  assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username'], ['execute', 'mobile: replaceElementValue', [{ elementId: 'field-1', text: '' }]]]);
});
test('an empty locator value and an empty intent extra stay refused', async () => {
  const f = fixture('android');
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator: { using: 'id', value: '' }, text: '' }), error('NOT_ALLOWED'));
  assert.deepEqual(await f.handler.call('jev_start_activity', { ...base, package: 'example.app', activity: '.Main', intentExtras: { route: '' } }), error('NOT_ALLOWED'));
  assert.deepEqual(f.calls, []);
});
test('a lost clear acknowledgement stops setValue and closes subsequent dispatch with a redacted error', async () => {
  const f = fixture();
  f.driver.clear = async (...args) => { f.calls.push(['clear', ...args]); throw new Error('password private-test-value'); };
  assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: 'private-test-value' }), error('DRIVER_ERROR'));
  assert.deepEqual(await f.handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), error('NOT_ALLOWED'));
  assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username'], ['clear', 'field-1']]);
});
for (const matches of [[], [{ ELEMENT: 'first' }, { ELEMENT: 'second' }]]) {
  test(`replacement refuses ${matches.length} locator matches before input`, async () => {
    const f = fixture(); f.driver.findElements = async (...args) => { f.calls.push(['findElements', ...args]); return matches; };
    assert.deepEqual(await f.handler.call('jev_replace_text', { ...base, locator, text: 'new' }), error('NOT_UNIQUE'));
    assert.deepEqual(f.calls, [['findElements', 'accessibility id', 'username']]);
    assert.deepEqual(await f.handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), success);
    assert.deepEqual(f.calls[1], ['terminateApp', 'example.app']);
  });
}
test('session, version and operation guards refuse before dispatch', async () => {
  const f = fixture('android');
  assert.deepEqual(await f.handler.call('jev_android_back', { ...base, sessionId: 'foreign' }), error('SESSION_MISMATCH'));
  assert.deepEqual(await f.handler.call('jev_android_back', { ...base, extensionVersion: 2 }), error('VERSION_MISMATCH'));
  assert.deepEqual(await f.handler.call('execute_script', { ...base, script: 'anything' }), error('NOT_ALLOWED'));
  assert.deepEqual(await f.handler.call('jev_android_back', base), success);
  assert.deepEqual(f.calls, [['pressKeyCode', 4]]);
});
for (const platform of ['ios', 'android'] as const) {
  test(`${platform} screen returns PNG and its frame with platform orientation reads`, async () => {
    const f = fixture(platform);
    assert.deepEqual(await f.handler.call('jev_screen', base), { isError: false, content: [{ type: 'text', text: 'Screen captured.' }],
      structuredContent: { ...base, pngBase64: png, rect: { x: 0, y: 0, width: 390, height: 844 }, orientation: platform === 'ios' ? 'PORTRAIT' : 'LANDSCAPE' } });
    assert.deepEqual(f.calls, [['getScreenshot'], ['getWindowRect'], platform === 'ios' ? ['proxyCommand', '/orientation', 'GET'] : ['getOrientation']]);
  });
  test(`${platform} settings apply only the locked settings and return readback`, async () => {
    const f = fixture(platform);
    assert.deepEqual(await f.handler.call('jev_settings', { ...base, settings: SOURCE_SETTINGS[platform] }), {
      isError: false, content: [{ type: 'text', text: 'Settings read back.' }], structuredContent: { ...base, settings: SOURCE_SETTINGS[platform] } });
    assert.deepEqual(f.calls, [['updateSettings', SOURCE_SETTINGS[platform]], ['getSettings']]);
    assert.deepEqual(await f.handler.call('jev_settings', { ...base, settings: { arbitrary: true } }), error('NOT_ALLOWED'));
    assert.equal(f.calls.length, 2);
  });
}
test('start activity forces stop and wait and preserves string extras in one command', async () => {
  const f = fixture('android');
  assert.deepEqual(await f.handler.call('jev_start_activity', { ...base, package: 'example.app', activity: '.Main', intentExtras: { route: 'settings' } }), success);
  assert.deepEqual(f.calls, [['execute', 'mobile: startActivity', [{ component: 'example.app/.Main', stop: true, wait: true, extras: [['s', 'route', 'settings']] }]]]);
});
test('Android-only operations refuse on iOS and a valid terminate sends exactly one command', async () => {
  const f = fixture();
  assert.deepEqual(await f.handler.call('jev_android_back', base), error('NOT_ALLOWED'));
  assert.deepEqual(await f.handler.call('jev_start_activity', { ...base, package: 'example.app', activity: '.Main', intentExtras: {} }), error('NOT_ALLOWED'));
  assert.deepEqual(await f.handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), success);
  assert.deepEqual(f.calls, [['terminateApp', 'example.app']]);
});
test('malformed native screen data is refused without exposing its contents', async () => {
  const f = fixture(); f.driver.getScreenshot = async () => 'private-test-value';
  assert.deepEqual(await f.handler.call('jev_screen', base), error('DRIVER_ERROR'));
  assert.deepEqual(await f.handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), error('NOT_ALLOWED'));
});
test('inventory reports only driver facts and explicitly leaves device process identity unknown', async () => {
  const f = fixture();
  Object.assign(f.driver, { opts: { wdaLocalPort: 18100, mjpegServerPort: 18101 }, wda: { xcodebuild: { xcodebuild: { proc: { pid: 1234 } } } } });
  assert.deepEqual(await f.handler.call('jev_session_inventory', base), { isError: false, content: [{ type: 'text', text: 'Driver inventory only.' }],
    structuredContent: { ...base, platform: 'ios', device: 'device-1', ports: [{ name: 'wda', port: 18100 }, { name: 'mjpeg', port: 18101 }],
      hostProcesses: [{ kind: 'xcodebuild', pid: 1234 }], deviceProcesses: { status: 'unknown' } } });
  assert.deepEqual(await f.handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), success);
  assert.deepEqual(f.calls, [['terminateApp', 'example.app']]);
});
test('a clear timeout closes dispatch and its late completion cannot send setValue', { timeout: 250 }, async () => {
  const calls: unknown[][] = [];
  let finishClear: (value: unknown) => void = () => {};
  const handler = createExtensionHandler({ platform: 'ios', device: 'device-1', timeoutMs: 20,
    getSession: () => ({ ownership: 'owned', platform: 'ios', device: 'device-1', driver: {
      findElements: async () => [{ ELEMENT: 'field-1' }],
      clear: (...args: unknown[]) => { calls.push(['clear', ...args]); return new Promise(done => { finishClear = done; }); },
      setValue: async (...args: unknown[]) => { calls.push(['setValue', ...args]); },
    } }) });
  assert.deepEqual(await handler.call('jev_replace_text', { ...base, locator, text: 'new' }), error('TIMEOUT'));
  finishClear(null);
  assert.deepEqual(await handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), error('NOT_ALLOWED'));
  assert.deepEqual(calls, [['clear', 'field-1']]);
});
test('cancellation during native clear closes the sequence before a late clear completion', { timeout: 500 }, async () => {
  const controller = new AbortController(); const calls: string[] = [];
  let finishClear: (value: unknown) => void = () => {};
  const handler = createExtensionHandler({ platform: 'ios', device: 'device-1', getSession: () => ({ ownership: 'owned', platform: 'ios', device: 'device-1', driver: {
    findElements: async () => [{ ELEMENT: 'field-1' }],
    clear: () => { calls.push('clear'); controller.abort(); return new Promise(done => { finishClear = done; }); },
    setValue: async () => { calls.push('setValue'); },
  } }) });
  assert.deepEqual(await handler.call('jev_replace_text', { ...base, locator, text: 'new' }, controller.signal), error('TIMEOUT'));
  finishClear(null);
  assert.deepEqual(await handler.call('jev_terminate_app', { ...base, appId: 'example.app' }), error('NOT_ALLOWED'));
  assert.deepEqual(calls, ['clear']);
});
