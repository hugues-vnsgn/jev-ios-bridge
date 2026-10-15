import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson, observedActionDigest, parseObservedAction } from '../src/observed/schema.js';

const raw = () => ({ version: 1, actionId: 'one', allocationId: 'abcdef00-0000-4000-8000-000000000001',
  app: { bundleId: 'dev.fixture' }, action: { kind: 'tap', selector: { identifier: ' Go ', role: 'button' } },
  before: { present: [{ identifier: ' Go ' }] }, after: { present: [{ identifier: 'Done' }] }, timeoutMs: 100 });

test('canonical requests fill defaults, normalize UUIDs and recursively freeze an independent snapshot', () => {
  const input = raw(); const parsed = parseObservedAction(input);
  assert.equal(parsed.allocationId, input.allocationId.toUpperCase());
  assert.deepEqual(parsed.before.absent, []); assert.deepEqual(parsed.after.absent, []);
  assert.equal(parsed.action.selector.identifier, ' Go ');
  input.before.present[0]!.identifier = 'changed';
  assert.equal(parsed.before.present[0]!.identifier, ' Go ');
  assert.equal(Object.isFrozen(parsed), true); assert.equal(Object.isFrozen(parsed.before.present), true);
  assert.equal(Object.isFrozen(parsed.action.selector), true);
});
test('digest ignores object key order and UUID case, preserving arrays and text exactly', () => {
  const parsed = parseObservedAction(raw());
  const reordered = JSON.parse(canonicalJson(parsed)) as Record<string, unknown>;
  assert.equal(observedActionDigest(parsed), observedActionDigest(parseObservedAction(reordered)));
  assert.equal(observedActionDigest(parsed), observedActionDigest(parseObservedAction({ ...raw(), allocationId: parsed.allocationId,
    before: { ...raw().before, absent: [] }, after: { ...raw().after, absent: [] } })));
  assert.notEqual(observedActionDigest(parsed), observedActionDigest(parseObservedAction({ ...raw(), timeoutMs: 101 })));
  assert.notEqual(observedActionDigest(parsed), observedActionDigest(parseObservedAction({ ...raw(),
    before: { present: [{ identifier: 'Go' }] } })));
  assert.equal(canonicalJson({ b: 1, a: [{ z: 2, a: 1 }, ' A '] }), '{"a":[{"a":1,"z":2}," A "],"b":1}');
});
for (const input of [null, {}, { ...raw(), version: 2 }, { ...raw(), deviceId: 'raw' }, { ...raw(), timeoutMs: 99 },
  { ...raw(), timeoutMs: 60001 }, { ...raw(), timeoutMs: 100.5 }, { ...raw(), actionId: '../escape' },
  { ...raw(), actionId: 'a'.repeat(81) }, { ...raw(), allocationId: 'bad' }, { ...raw(), app: { bundleId: 'invalid' } },
  { ...raw(), action: { kind: 'tap', selector: { value: 'only' } } }, { ...raw(), before: { present: [] } },
  { ...raw(), after: { present: Array.from({ length: 13 }, () => ({ identifier: 'done' })) } },
  { ...raw(), action: { kind: 'tap', selector: { identifier: 'go', elementRef: 'secret' } } },
  { ...raw(), before: { present: [{ label: 'secret'.repeat(12000) }] } }]) {
  test(`invalid request rejects safely ${JSON.stringify(input).length}`, () => {
    assert.throws(() => parseObservedAction(input), error => {
      const value = error as { code: string; toJSON(): unknown };
      assert.ok(['INVALID_REQUEST', 'UNSUPPORTED_VERSION'].includes(value.code));
      assert.equal(JSON.stringify(value.toJSON()).includes('secret'), false); return true;
    });
  });
}
test('request bounds accept the documented endpoints and reject circular/non-JSON input', () => {
  assert.equal(parseObservedAction({ ...raw(), timeoutMs: 60000, actionId: 'a'.repeat(80) }).timeoutMs, 60000);
  const circular: Record<string, unknown> = raw(); circular.self = circular;
  assert.throws(() => parseObservedAction(circular), { code: 'INVALID_REQUEST' });
  assert.throws(() => parseObservedAction(undefined), { code: 'INVALID_REQUEST' });
});
