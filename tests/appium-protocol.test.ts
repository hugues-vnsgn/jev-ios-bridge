import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const client = fileURLToPath(new URL('../.scratch/appium-mcp-migration/candidate-stack/experiments/protocol-client.mjs', import.meta.url));
const provider = fileURLToPath(new URL('./fixtures/appium-protocol-provider.mjs', import.meta.url));
function run(t: TestContext, fault: string, platform = 'ios') {
  const directory = mkdtempSync(join(tmpdir(), 'appium-protocol-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const config = join(directory, 'config.json');
  const wire = join(directory, 'wire.json');
  writeFileSync(config, JSON.stringify({ platform, provider: { command: process.execPath, args: [provider, fault, platform, wire] } }));
  const result = spawnSync(process.execPath, [client, config], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('private-test-value'), false);
  const allWire = JSON.parse(readFileSync(wire, 'utf8')) as { name: string; arguments: Record<string, unknown> }[];
  return { result: JSON.parse(result.stdout), wire: allWire.filter(x => x.name.startsWith('appium_')), allWire };
}

test('an unexpected Appium server version is refused before session creation', t => {
  const { result, wire } = run(t, 'server-version');
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'SERVER_IDENTITY_MISMATCH');
  assert.equal(wire.length, 0);
});

test('changed or missing required tool schemas are refused before session creation', t => {
  for (const fault of ['schema-change', 'schema-missing', 'schema-duplicate']) {
    const { result, wire } = run(t, fault);
    assert.equal(result.reason, 'TOOL_SCHEMA_MISMATCH');
    assert.equal(wire.length, 0);
  }
});

test('creation replies cannot supply guessed, foreign, duplicate, or inconsistent session identities', t => {
  for (const fault of ['create-missing', 'create-text-only', 'create-foreign', 'create-duplicate', 'create-id', 'create-id-type', 'create-attached', 'create-inconsistent', 'create-extension', 'create-error']) {
    const { result, wire } = run(t, fault);
    assert.equal(result.status, 'refused');
    assert.equal(result.reason, fault === 'create-error' ? 'VENDOR_ERROR' : 'INVALID_CREATION_RESULT');
    assert.equal(wire.filter(x => x.name === 'appium_session_management' && x.arguments.action === 'create').length, 1);
    assert.equal(wire.length, 1);
    assert.equal(result.quarantined, true);
    assert.equal(result.leaseReleased, false);
  }
});

test('broken accessibility XML stops the run before a lookup or tap', t => {
  for (const platform of ['ios', 'android']) for (const fault of ['xml-envelope', 'xml-malformed', 'xml-root', 'xml-doctype', 'xml-missing-value']) {
    const { result, wire } = run(t, fault, platform);
    assert.equal(result.reason, 'INVALID_XML_RESULT');
    assert.deepEqual(wire.map(x => x.name), ['appium_session_management', 'appium_get_page_source']);
    assert.equal(result.quarantined, true);
  }
});

test('all-match lookup refuses malformed IDs and preserves zero or multiple matches before input', t => {
  for (const platform of ['ios', 'android']) for (const fault of ['elements-missing', 'elements-id', 'elements-duplicate', 'elements-zero', 'elements-many', 'elements-json']) {
    const { result, wire } = run(t, fault, platform);
    assert.equal(result.reason, ['elements-zero', 'elements-many'].includes(fault) ? 'TARGET_NOT_UNIQUE' : 'INVALID_ELEMENTS_RESULT');
    assert.equal(wire.filter(x => x.name === 'appium_find_elements').length, 1);
    assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 0);
  }
});

test('a tap is never retried after an error, lost reply, prose-only success, or conflicting completion receipt', t => {
  for (const fault of ['action-text-only', 'action-id', 'action-digest', 'action-error', 'action-lost']) {
    const { result, wire } = run(t, fault);
    assert.equal(result.status, 'refused');
    assert.equal(result.quarantined, true);
    assert.equal(result.leaseReleased, false);
    assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 1);
    assert.equal(wire.length, 4);
    assert.equal(result.reason, fault === 'action-error' ? 'VENDOR_ERROR' : fault === 'action-lost' ? 'PROVIDER_UNAVAILABLE' : 'INVALID_COMPLETION_RESULT');
  }
});

test('screenshot replies require a complete PNG with matching dimensions and reject viewer-only data', t => {
  for (const fault of ['png-viewer', 'png-mime', 'png-base64', 'png-truncated', 'png-crc', 'png-dimensions', 'png-palette', 'png-chunk-name', 'png-high-bit', 'png-reserved-bit', 'png-compressed-tail']) {
    const { result, wire } = run(t, fault);
    assert.equal(result.reason, 'INVALID_SCREENSHOT_RESULT');
    assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 1);
    assert.equal(wire.filter(x => x.name === 'appium_screenshot').length, 1);
    assert.equal(wire.at(-1)?.arguments.returnRawBase64, true);
    assert.equal(result.leaseReleased, false);
  }
});

test('the recorded iOS and Android tracer replies confirm a fresh visible change with one explicit-session tap', t => {
  for (const platform of ['ios', 'android']) {
    const { result, wire } = run(t, 'none', platform);
    assert.equal(result.status, 'passed-host-protocol');
    assert.equal(result.before, 'Selected: None');
    assert.equal(result.after, 'Selected: Apple');
    assert.equal(result.screenshot.mimeType, 'image/png');
    assert.equal(result.screenshot.width, platform === 'ios' ? 1206 : 1080);
    assert.equal(result.screenshot.height, platform === 'ios' ? 2622 : 2400);
    assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 1);
    assert.equal(wire.filter(x => x.arguments.action === 'delete').length, 1);
    const sessionId = platform === 'ios' ? '175c3947-5920-40e5-bc7e-0ad161166e4d' : 'd2df8099-06b0-4fe3-b223-ec301c82c340';
    for (const call of wire.slice(1)) assert.equal(call.arguments.sessionId, sessionId);
    assert.equal(result.leaseReleased, false);
    assert.equal(result.nativeFenceEstablished, false);
  }
});

test('changed loaded software or WDA selection is refused before any native request', t => {
  for (const fault of ['stack-version', 'stack-integrity', 'stack-loaded', 'stack-wda', 'stack-missing']) {
    const { result, wire, allWire } = run(t, fault);
    assert.equal(result.reason, 'RUNTIME_STACK_MISMATCH');
    assert.equal(wire.length, 0);
    assert.equal(allWire.length, 1);
    assert.equal(allWire[0]?.name, 'jev_phase1_stack');
  }
});

test('the tracer checks its starting screen before authorizing the tap', t => {
  const { result, wire } = run(t, 'xml-starting-state');
  assert.equal(result.reason, 'VISIBLE_CHECK_FAILED');
  assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 0);
});

test('the native XML viewer resource is ignored while duplicate XML text remains ambiguous', t => {
  assert.equal(run(t, 'xml-viewer').result.status, 'passed-host-protocol');
  const duplicate = run(t, 'xml-duplicate');
  assert.equal(duplicate.result.reason, 'INVALID_XML_RESULT');
  assert.equal(duplicate.wire.filter(x => x.name === 'appium_gesture').length, 0);
});

test('tap completion is bound to the pinned effective tool defaults sent on the wire', t => {
  const { result, wire } = run(t, 'action-effective-default');
  assert.equal(result.status, 'passed-host-protocol');
  assert.equal(wire.find(x => x.name === 'appium_gesture')?.arguments.maxScrollAttempts, 10);
});
