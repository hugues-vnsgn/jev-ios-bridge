import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureCommand, type CaptureDriver } from '../src/capture.js';
import type { DeviceDriver, RunEvent, RunLog, Snapshot } from '../src/contracts/index.js';
import { AdmissionError } from '../src/device/admission-sqlite.js';
import { runScriptedScenario } from '../src/scripted/run.js';
import { parseScriptedScenario } from '../src/scripted/schema.js';

const STORE_MESSAGE = 'Store schema 2; this binary requires schema 3. Use admission-maintenance upgrade after reading the activation guide.';

async function captureWith(capture: CaptureDriver['capture']) {
  let stdout = ''; let stderr = '';
  const code = await captureCommand({ serial: 'emulator-5554' }, {
    signal: new AbortController().signal, defaultDevice: undefined,
    driver: () => ({ capture, close: async () => {} }),
    write: { stdout: text => { stdout += text; }, stderr: text => { stderr += text; } } });
  return { code, stdout, stderr };
}

test('capture reports the admission store\'s public reason code and its own message', async () => {
  const result = await captureWith(async () => { throw new AdmissionError('STATE_UNAVAILABLE', STORE_MESSAGE); });
  assert.deepEqual(result, { code: 3, stdout: '', stderr: `STATE_UNAVAILABLE: ${STORE_MESSAGE}\n` });
});

test('capture keeps a store code that is not a public reason code generic', async () => {
  const result = await captureWith(async () => { throw new AdmissionError('DISPATCH_CLOSED', 'Dispatch is closed.'); });
  assert.deepEqual(result, { code: 3, stdout: '', stderr: 'EXECUTION_ERROR: capture stopped on an unexpected error.\n' });
});

test('capture still hides the text of an unexpected error', async () => {
  const result = await captureWith(async () => { throw new Error('/Users/someone/secret path'); });
  assert.equal(result.stderr, 'EXECUTION_ERROR: capture stopped on an unexpected error.\n');
});

function recordingLog(): RunLog & { events: RunEvent[] } {
  const events: RunEvent[] = [];
  return { events,
    async append(type, data) { events.push({ version: 1, runId: 'store', sequence: events.length + 1,
      at: new Date().toISOString(), type, data: structuredClone(data) }); },
    async read() { return events; } };
}

const scenario = parseScriptedScenario({ version: 1, app: { bundleId: 'com.example.app' }, values: {}, steps: [
  { id: 'verify', kind: 'checkpoint', guard: { present: [{ role: 'text', label: 'Home' }] },
    assertions: [{ id: 'shown', claim: 'Home is shown.' }] },
] });
const judge = { async judge() { return { probabilities: {}, inputTokens: 0, latencyMs: 0, model: 'jev-1.13.0' }; } };
const never = async (): Promise<Snapshot> => { throw new Error('not reached'); };

async function runPreparing(error: Error) {
  const driver: DeviceDriver = { async prepare() { throw error; }, observe: never, act: never, actPath: () => undefined, async close() {} };
  const log = recordingLog();
  const report = await runScriptedScenario({ runId: 'store', scenario, driver, judge, log });
  return { report, errors: log.events.filter(event => event.type === 'error').map(event => [event.data.phase, event.data.code]) };
}

test('a run whose admission store refuses ends with the store\'s public reason, not a generic execution error', async () => {
  const { report, errors } = await runPreparing(new AdmissionError('STATE_UNAVAILABLE', STORE_MESSAGE));
  assert.equal(report.verdict, 'inconclusive');
  assert.equal(report.reason, 'STATE_UNAVAILABLE');
  assert.deepEqual(errors, [['prepare', 'STATE_UNAVAILABLE']]);
});

test('a run keeps a store code that is not a public reason code generic', async () => {
  const { report } = await runPreparing(new AdmissionError('DISPATCH_CLOSED', 'Dispatch is closed.'));
  assert.equal(report.reason, 'EXECUTION_ERROR');
});
