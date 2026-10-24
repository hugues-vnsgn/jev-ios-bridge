import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { clientFixture } from './fixtures/appium-wire/client-fixture.js';
import { AppiumCommandSession } from '../src/appium/session.js';

test('guarded source calls preserve the explicit session, and pending pairs drain before input', async t => {
  const f = clientFixture(t); const client = await f.open('source-late-second', resolve('tests/fixtures/appium-wire/ios/observe-2.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const first = await client.capturePair(async pair => pair);
  assert.match(first.xml, /AppiumAUT/);
  const pending = client.capturePair(async pair => pair);
  const sourceCalls = () => f.calls().filter(c => c.params?.name === 'appium_get_page_source').length;
  for (const deadline = Date.now() + 5000; sourceCalls() < 2 && Date.now() < deadline;) await delay(10);
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
const toolNames = (f: ReturnType<typeof clientFixture>) => f.calls().filter(c => c.method === 'tools/call').map(c => c.params.name);
const tap = [{ type: 'pointer' as const, id: 'finger', parameters: { pointerType: 'touch' as const }, actions: [
  { type: 'pointerMove' as const, duration: 0, x: 10, y: 20 }, { type: 'pointerDown' as const, button: 0 },
  { type: 'pause' as const, duration: 50 }, { type: 'pointerUp' as const, button: 0 }] }];
test('a pair shares one deadline, so a late screenshot after a slow source times out as TIMEOUT within it', async t => {
  const f = clientFixture(t); const client = await f.open('source-slow-screen-held', resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
  await AppiumCommandSession.start({ client, profile: f.profile });
  const started = performance.now();
  await assert.rejects(client.capturePair(async pair => pair, 1500), { code: 'TIMEOUT' });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 2200, `the pair took ${Math.round(elapsed)} ms against its 1500 ms deadline`);
  assert.equal(client.dispatchOpen, false);
  assert.deepEqual(toolNames(f), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen']);
});
test('a failed cleanup delete is not kept, so a later delete reaches the provider and succeeds', async t => {
  const f = clientFixture(t); const client = await f.open('delete-late-first', resolve('tests/fixtures/appium-wire/ios/observe-1.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  await assert.rejects(client.manageSession({ action: 'delete', sessionId: session.sessionId }, f.profile, 50), { code: 'ACKNOWLEDGEMENT_LOST' });
  await delay(300);
  assert.deepEqual(await client.manageSession({ action: 'delete', sessionId: session.sessionId }, f.profile), { kind: 'deleted' });
  assert.deepEqual(toolNames(f), ['appium_session_management', 'jev_settings', 'appium_session_management', 'appium_session_management']);
});
test('performActions waits for a pending pair, then sends one owned perform-actions call', async t => {
  const f = clientFixture(t); const client = await f.open('source-late-first-held', resolve('tests/fixtures/appium-wire/ios/actions.jsonl'));
  const session = await AppiumCommandSession.start({ client, profile: f.profile });
  const pair = client.capturePair(async ({ screen }) => screen.rect);
  await delay(50);
  const performed = client.performActions(tap);
  await delay(50);
  assert.deepEqual(toolNames(f), ['appium_session_management', 'jev_settings', 'appium_get_page_source']);
  writeFileSync(f.trace + '.release', 'release');
  assert.deepEqual(await pair, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(await performed, undefined);
  assert.deepEqual(f.calls().filter(c => c.method === 'tools/call').at(-1).params,
    { name: 'appium_perform_actions', arguments: { sessionId: 'ios-session', actions: tap } });
  await assert.rejects(client.performActions([{ ...tap[0]!, actions: [] }]), { code: 'NOT_ALLOWED' });
  await session.finish();
  assert.deepEqual(toolNames(f), ['appium_session_management', 'jev_settings', 'appium_get_page_source', 'jev_screen', 'appium_perform_actions', 'appium_session_management']);
});
test('a lost perform-actions acknowledgement closes dispatch and is never resent', async t => {
  const f = clientFixture(t); const client = await f.open('actions-lost', resolve('tests/fixtures/appium-wire/ios/actions.jsonl'));
  await AppiumCommandSession.start({ client, profile: f.profile });
  await assert.rejects(client.performActions(tap, 100), { code: 'ACKNOWLEDGEMENT_LOST' });
  assert.equal(client.dispatchOpen, false);
  await assert.rejects(client.performActions(tap), { code: 'CONNECTION_LOST' });
  assert.equal(toolNames(f).filter(name => name === 'appium_perform_actions').length, 1);
});
