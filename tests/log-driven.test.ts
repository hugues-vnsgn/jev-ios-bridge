/**
 * The run log's protocol words for driven mode (Issue 08): a typed value that happens to equal one of them doesn't
 * redact the log's structure, as for scripted runs; anything else is still redacted.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redact } from '../src/log/index.js';

test('driven-mode protocol words pass through redaction; free text and step ids do not', () => {
  const secrets = ['do', 'back', 'claude', 'jev', 'scroll', 'tapAt', 'NONE_FITS', 'handback', 'back-key', 'down', 'stop', 'signIn'];
  assert.deepEqual(redact({
    kind: 'do', plannedSteps: [{ id: 'a', kind: 'do' }],
  }, secrets), { kind: 'do', plannedSteps: [{ id: 'a', kind: 'do' }] });
  assert.deepEqual(redact({ action: 'back', decidedBy: 'claude', actPath: 'back-key' }, secrets),
    { action: 'back', decidedBy: 'claude', actPath: 'back-key' });
  assert.deepEqual(redact({ action: 'scroll', direction: 'down', decidedBy: 'jev' }, secrets),
    { action: 'scroll', direction: 'down', decidedBy: 'jev' });
  assert.deepEqual(redact({ action: 'tapAt' }, secrets), { action: 'tapAt' });
  assert.deepEqual(redact({ reason: 'NONE_FITS' }, secrets), { reason: 'NONE_FITS' });
  assert.deepEqual(redact({ phase: 'handback', code: 'HANDBACK_TIMEOUT' }, secrets), { phase: 'handback', code: 'HANDBACK_TIMEOUT' });
  assert.deepEqual(redact({ kind: 'stop' }, secrets), { kind: 'stop' });
  assert.deepEqual(redact({ status: 'missing', failure: 'timeout', phase: 'preflight' }, ['missing', 'timeout', 'preflight']),
    { status: 'missing', failure: 'timeout', phase: 'preflight' });
  const revised = redact({ kind: 'revise', steps: [{ id: 'signIn', kind: 'do' }] }, secrets) as { steps: { id: string; kind: string }[] };
  assert.equal(revised.steps[0]!.kind, 'do');
  assert.match(revised.steps[0]!.id, /^redacted_[a-f0-9]{32}$/);
  assert.deepEqual(redact({ note: 'go back' }, secrets), { note: 'go [REDACTED]' });
});
