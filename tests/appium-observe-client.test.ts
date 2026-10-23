import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { clientFixture } from './fixtures/appium-wire/client-fixture.js';
import { AppiumCommandSession } from '../src/appium/session.js';

test('guarded source calls preserve the explicit session, and pending pairs drain before input', async t => {
  const f = clientFixture(t); const client = await f.open('source-late-second', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const first = await client.capturePair(async pair => pair);
  assert.match(first.xml, /AppiumAUT/);
  const pending = client.capturePair(async pair => pair);
  await delay(20);
  assert.equal(client.observationPending, true);
  const input = client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } });
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source']);
  assert.equal((await pending).screen.rect.width, 1);
  assert.equal((await input).acknowledged, true);
  await session.finish();
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name),
    ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_get_page_source', 'jev_screen', 'jev_terminate_app', 'appium_session_management']);
});
test('a source timeout retires dispatch, requests only owned deletion, and rejects a later input', async t => {
  const f = clientFixture(t); const client = await f.open('source-late-first', resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
  await AppiumCommandSession.start({ client, profile: f.profile });
  await assert.rejects(client.pageSource(20), { code: 'TIMEOUT' });
  assert.equal(client.dispatchOpen, false);
  await assert.rejects(client.callExtension({ name: 'jev_terminate_app', arguments: { appId: 'example.app' } }), { code: 'CONNECTION_LOST' });
  await assert.rejects(client.manageSession({ action: 'delete', sessionId: 'foreign' }, f.profile), { code: 'SESSION_MISMATCH' });
  await client.manageSession({ action: 'delete', sessionId: 'ios-session' }, f.profile);
  await delay(300);
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').map(c => c.params), [
    { name: 'appium_session_management', arguments: { action: 'create', platform: 'ios', capabilities: JSON.stringify(f.profile.capabilities) } },
    { name: 'jev_settings', arguments: { extensionVersion: 1, sessionId: 'ios-session', settings: { pageSourceExcludedAttributes: '', snapshotMaxDepth: 50, waitForIdleTimeout: 1, animationCoolOffTimeout: 2 } } },
    { name: 'appium_get_page_source', arguments: { sessionId: 'ios-session', saveToFile: false } },
    { name: 'appium_session_management', arguments: { action: 'delete', sessionId: 'ios-session' } },
  ]);
});
