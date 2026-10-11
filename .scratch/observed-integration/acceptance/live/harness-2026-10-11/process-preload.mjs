import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { check, json, makeGate, privateDirectory, readPrivate, recordChild, sha, same } from './receipts.mjs';
import { policy } from './command-policy.mjs';
import { withhold } from './l04-callback-decision.mjs';

const call = readPrivate(process.env.JEV_LIVE_PROCESS_FILE ?? '');
const planBytes = fs.readFileSync(call.dispatch);
check(sha(planBytes) === call.dispatchSha256, 'DISPATCH_HASH');
const plan = readPrivate(call.dispatch);
check(plan.status === 'REVIEWED_ENABLED' && plan.review?.approved === true && plan.node === process.execPath
  && plan.cwd === process.cwd() && process.env.JEV_DEVICE_WINDOW === 'off'
  && !('TYPESAFE_API_KEY' in process.env) && !('NODE_OPTIONS' in process.env), 'UNREVIEWED_BOOTSTRAP');
privateDirectory(call.receipts); privateDirectory(plan.evidenceDir);
check(same(process.env, call.environment), 'PARENT_ENVIRONMENT_VARIANCE');
for (const [file, expected] of Object.entries(plan.fileHashes)) check(sha(fs.readFileSync(file)) === expected, 'PIN_VARIANCE');
const gate = makeGate(plan.evidenceDir); const rules = policy(plan, call); let sequence = 0; let injection = false;
const originalSpawn = cp.spawn; const originalExec = cp.execFile;
function begin(api, file, args, options) {
  gate.check();
  try {
    check(++sequence <= plan.limits.childrenPerProcess, 'CHILD_COUNT');
    const kind = rules.authorize(api, file, args, options);
    const directory = path.join(call.receipts, String(sequence).padStart(4, '0'));
    fs.mkdirSync(directory, { mode: 0o700 });
    const invocation = { api, kind, executable: file, argv: args, cwd: options.cwd ?? process.cwd(),
      environmentKeys: Object.keys(options.env).sort(), environmentSha256: sha(JSON.stringify(options.env)),
      startedAtUtc: new Date().toISOString(), row: call.row, phase: call.phase, dispatchSha256: call.dispatchSha256 };
    json(path.join(directory, 'invocation.json'), invocation);
    return { kind, directory, invocation };
  } catch (error) { gate.fail(error.message); throw error; }
}
function retained(item, receipt) {
  try {
    check(receipt.rawReceiptDurablyRetained && !receipt.truncated, 'RECEIPT_NOT_RETAINED');
    rules.received(item.kind, receipt);
    json(path.join(item.directory, 'binding.json'), rules.snapshot());
  } catch (error) { gate.fail(error.message); throw error; }
}
cp.spawn = function(file, args, options) {
  const item = begin('spawn', file, args, options);
  let child;
  try { child = Reflect.apply(originalSpawn, this, [file, args, options]); }
  catch (error) { gate.fail('SPAWN_THROW'); throw error; }
  recordChild(child, item.directory, item.invocation, plan.limits, gate, receipt => { try { retained(item, receipt); } catch {} });
  return child;
};
cp.execFile = function(file, args, options, callback) {
  check(typeof callback === 'function', 'CALLBACK_EXECFILE_ONLY');
  const item = begin('execFile', file, args, options); let callbackArgs; let receipt; let delivered = false;
  function deliver() {
    if (delivered || !callbackArgs || !receipt) return;
    delivered = true;
    let output = callbackArgs;
    try {
      retained(item, receipt); gate.check();
      check(Buffer.from(callbackArgs[1]).equals(receipt.stdout) && Buffer.from(callbackArgs[2]).equals(receipt.stderr), 'CALLBACK_RAW_BYTE_VARIANCE');
      if (call.row === 'L04' && call.phase === 'action' && item.kind === 'touch') {
        check(!injection, 'SECOND_L04_INJECTION');
        output = withhold(receipt, callbackArgs[0] ?? null); injection = true;
        json(path.join(item.directory, 'injection.json'), { classification: 'synthetic reply loss before production callback parsing',
          stdoutSha256: receipt.stdoutSha256, stderrSha256: receipt.stderrSha256, actualCloseAtUtc: receipt.actualCloseAtUtc,
          expectedActionAttempted: null, expectedActionAcknowledged: null });
      }
    } catch (error) { gate.fail(error.message); const refusal = new Error('RECORDER_EVIDENCE_UNCONFIRMED'); refusal.code = 'HARNESS_UNCONFIRMED'; output = [refusal, '', '']; }
    queueMicrotask(() => Reflect.apply(callback, undefined, output));
  }
  let child;
  try { child = Reflect.apply(originalExec, this, [file, args, options, (...values) => { callbackArgs = values; deliver(); }]); }
  catch (error) { gate.fail('EXECFILE_THROW'); throw error; }
  recordChild(child, item.directory, item.invocation, plan.limits, gate, value => { receipt = value; deliver(); });
  return child;
};
for (const method of ['exec', 'execSync', 'execFileSync', 'spawnSync', 'fork']) {
  cp[method] = () => { gate.fail('UNSUPPORTED_CHILD_API_' + method); throw new Error('UNSUPPORTED_CHILD_API'); };
}
syncBuiltinESMExports();
process.once('exit', code => {
  try { json(path.join(call.receipts, 'parent-exit.json'), { code, backendAttempts: sequence, counts: rules.snapshot(), injection, actualParentClose: 'controller-owned' }); }
  catch { gate.fail('PARENT_EXIT_RETENTION'); }
});
