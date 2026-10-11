import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { check, json, makeGate, privateDirectory, readPrivate, recordChild, sha, same } from './receipts.mjs';
import { readinessBarrier } from './readiness-barrier.mjs';

const dispatch = process.argv[2];
const plan = readPrivate(dispatch);
check(plan.status === 'REVIEWED_ENABLED' && plan.review?.approved === true, 'HARNESS_DISABLED');
check(plan.legacyException?.status === 'REVIEWED_APPROVED'
  && plan.legacyException.environmentFile === '/Users/hugues_mini/Codes/AgentTools/jev-ios-bridge/.env', 'LEGACY_EXCEPTION_UNREVIEWED');
check(plan.node === process.execPath && plan.cwd === process.cwd(), 'CONTROLLER_IDENTITY');
check(plan.rows.length === 5 && same(plan.rows.map(r => r.id), ['L01', 'L02', 'L03', 'L04', 'L05']), 'ROWS');
check(plan.environment?.JEV_EXPERIMENTAL_OBSERVED === '1' && plan.environment?.JEV_DEVICE_WINDOW === 'off'
  && plan.environment?.JEV_RUNS_DIR === plan.runsDir && !('NODE_OPTIONS' in plan.environment)
  && !('TYPESAFE_API_KEY' in plan.environment), 'ENVIRONMENT');
check(typeof plan.protocolVersion === 'string' && Object.keys(plan.fileHashes).length >= 527
  && plan.metadataCommands.length > 0 && plan.sourceEnvironment, 'UNSET_PINS');
for (const [file, digest] of Object.entries(plan.fileHashes)) check(sha(fs.readFileSync(file)) === digest, 'FILE_PIN');
privateDirectory(plan.evidenceDir); privateDirectory(plan.runsDir);
const gate = makeGate(plan.evidenceDir); gate.check();
json(path.join(plan.evidenceDir, 'controller-start.json'), { at: new Date().toISOString(), dispatch, sha256: sha(fs.readFileSync(dispatch)) });
const preload = fileURLToPath(new URL('./process-preload.mjs', import.meta.url));
let serial = 0;
function launch(row, phase, args, device, legacy = false) {
  gate.check();
  const directory = path.join(plan.evidenceDir, String(++serial).padStart(3, '0') + '-' + row.id + '-' + phase);
  fs.mkdirSync(directory, { mode: 0o700 }); const receipts = path.join(directory, 'children'); fs.mkdirSync(receipts, { mode: 0o700 });
  const token = path.join(directory, 'process.json');
  const environment = { ...plan.environment, JEV_LIVE_PROCESS_FILE: token };
  json(token, { dispatch, dispatchSha256: sha(fs.readFileSync(dispatch)), row: row.id, phase, device: device ?? null, environment, receipts,
    legacy, publicArguments: args });
  const selectedPreload = legacy ? fileURLToPath(new URL('./legacy-bootstrap.mjs', import.meta.url)) : preload;
  const argv = ['--import', selectedPreload, plan.cli, ...args];
  const child = spawn(plan.node, argv, { cwd: plan.cwd, env: environment, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  const limits = { ...plan.limits, childMs: plan.limits.publicProcessMs, childBytes: plan.limits.publicOutputBytes };
  const closed = new Promise(resolve => recordChild(child, directory, { executable: plan.node, argv, row: row.id, phase,
    startedAtUtc: new Date().toISOString() }, limits, gate, resolve));
  return { child, closed, directory, receipts };
}
async function finish(p) {
  const r = await p.closed; check(r.rawReceiptDurablyRetained && !r.truncated && r.actualCloseSignal === null, 'PUBLIC_CLOSE');
  gate.check(); return r;
}
function requestFile(directory, name, value) { const file = path.join(directory, name + '.json'); json(file, value); return file; }
async function cli(row, phase, command, argument, device, extra = []) {
  const p = launch(row, phase, [command, argument, '--json', ...extra], device); p.child.stdin.end();
  p.child.stdout.resume(); p.child.stderr.resume();
  const r = await finish(p); let reply;
  try { reply = JSON.parse(r.stdout.toString('utf8')); } catch { throw new Error('INVALID_PUBLIC_JSON'); }
  const expectedExit = reply.kind === 'observed-operation-error' ? 3
    : reply.authority !== 'committed' ? 2
    : ['prepared', 'action_completed', 'retired_unused', 'outcome_observed', 'already_satisfied'].includes(reply.outcome) ? 0
    : reply.outcome === 'refused' ? 3 : 2;
  check(r.actualCloseCode === expectedExit, 'CLI_EXIT_MAPPING');
  return { reply, receipt: r, directory: p.directory };
}
async function legacySuccessor(row, scenarioFile, device) {
  const p = launch(row, 'silent', ['run', scenarioFile, '--json', '--no-log-pane', '--no-device-window'], device, true);
  p.child.stdin.end(); p.child.stdout.resume(); p.child.stderr.resume();
  const receipt = await finish(p); const reply = JSON.parse(receipt.stdout.toString('utf8'));
  check(receipt.actualCloseCode === 2 && reply.verdict === 'inconclusive' && reply.reason === 'DEVICE_BUSY'
    && reply.error?.code === 'DEVICE_BUSY' && reply.error.phase === 'prepare'
    && reply.inputTokens === 0 && reply.steps === 0, 'LEGACY_ADMISSION_ORACLE');
  const guard = readPrivate(path.join(p.receipts, 'legacy-guard-exit.json'));
  const parent = readPrivate(path.join(p.receipts, 'parent-exit.json'));
  check(guard.credentialLoaded === true && guard.outboundAttempts === 0 && guard.listenerAttempts === 1
    && guard.deniedListenerAttempts === 0 && parent.backendAttempts === 0, 'LEGACY_GUARD_ORACLE');
  json(path.join(p.directory, 'legacy-admission-oracle.json'), { status: 'PUBLIC_DEVICE_BUSY_WITH_ZERO_OUTBOUND_AND_BACKEND_ATTEMPTS',
    runId: reply.runId, credentialLoaded: true, authenticatedApiCoverage: false });
}
async function mcp(row, phase, tool, request, device, poll = false) {
  const p = launch(row, phase, ['mcp'], device); let counter = 0; let buffer = ''; const pending = new Map();
  p.child.stderr.resume();
  const transcript = []; let protocolError;
  p.child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    if (Buffer.byteLength(buffer) > plan.limits.publicOutputBytes) { protocolError = new Error('RPC_BUFFER'); gate.fail(protocolError.message); return; }
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue;
      try {
        const message = JSON.parse(line); transcript.push({ direction: 'in', message });
        if (message.id !== undefined) {
          const waiter = pending.get(message.id); check(waiter, 'UNEXPECTED_RPC_ID'); pending.delete(message.id);
          clearTimeout(waiter.timer); if (message.error) waiter.reject(new Error('RPC_ERROR')); else waiter.resolve(message.result);
        } else check(!message.method || message.method.startsWith('notifications/'), 'UNEXPECTED_SERVER_REQUEST');
      } catch (error) { protocolError = error; gate.fail(error.message); for (const waiter of pending.values()) waiter.reject(error); }
    }
  });
  p.closed.then(() => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error('RPC_OWNER_CLOSED')); } });
  function send(message) { gate.check(); transcript.push({ direction: 'out', message }); p.child.stdin.write(JSON.stringify(message) + '\n'); }
  function rpc(method, params) {
    const id = ++counter;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { gate.fail('RPC_DEADLINE'); reject(new Error('RPC_DEADLINE')); }, plan.limits.rpcMs);
      pending.set(id, { resolve, reject, timer }); send({ jsonrpc: '2.0', id, method, params });
    });
  }
  function unwrap(result) {
    check(Array.isArray(result?.content), 'RPC_CONTENT');
    const values = result.content.filter(c => c.type === 'text').flatMap(c => { try { return [JSON.parse(c.text)]; } catch { return []; } });
    check(values.length === 1, 'RPC_RESULT_AMBIGUOUS'); return values[0];
  }
  let reply;
  try {
    const initialized = await rpc('initialize', { protocolVersion: plan.protocolVersion, capabilities: {}, clientInfo: { name: 'jev-live-recorder', version: '1' } });
    check(initialized.protocolVersion === plan.protocolVersion, 'RPC_VERSION'); send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    reply = unwrap(await rpc('tools/call', { name: tool, arguments: request }));
    if (poll) {
      for (let i = 0; reply.state !== 'terminal' && reply.state !== 'unresolved' && i < 3; i++) {
        reply = unwrap(await rpc('tools/call', { name: 'get_observed_action', arguments: { actionId: row.prepare.actionId, waitMs: 45000 } }));
      }
      check(reply.state === 'terminal', 'ACTION_NOT_TERMINAL');
    }
    check(!protocolError && pending.size === 0, 'RPC_PENDING');
  } finally {
    json(path.join(p.directory, 'rpc-transcript.json'), transcript);
    p.child.stdin.end();
    const timer = setTimeout(() => { gate.fail('MCP_EOF_CLOSE_TIMEOUT'); p.child.kill('SIGTERM'); }, plan.limits.closeMs);
    try { const r = await finish(p); check(r.actualCloseCode === 0, 'MCP_EXIT'); } finally { clearTimeout(timer); }
  }
  return reply;
}
function assertResult(row, result) {
  const expected = { L01: ['outcome_observed', null, true, true], L02: ['already_satisfied', null, false, false],
    L03: ['refused', 'PRECONDITION_NOT_MET', false, false], L04: ['inconclusive', 'UI_ACTION_UNCONFIRMED', null, null],
    L05: ['outcome_observed', null, true, true] }[row.id];
  check(result.state === 'terminal' && result.authority === 'committed'
    && same([result.outcome, result.reason, result.actionAttempted, result.actionAcknowledged], expected), 'ROW_ORACLE_' + row.id);
  if (row.id === 'L04') check(result.admission === 'quarantined' && result.allocationState === 'quarantined', 'L04_QUARANTINE');
}
try {
  for (const row of plan.rows) {
    gate.check();
    const rowDir = path.join(plan.evidenceDir, row.id); fs.mkdirSync(rowDir, { mode: 0o700 });
    check(row.prepare.source.kind === 'create' && row.prepare.timeoutMs === 360000 && row.action.timeoutMs === 10000, 'ROW_INPUT');
    const prepFile = requestFile(rowDir, 'prepare', row.prepare);
    const prepared = ['L01', 'L03'].includes(row.id)
      ? (await cli(row, 'prepare', 'observed-allocate', prepFile)).reply
      : await mcp(row, 'prepare', 'prepare_observed_allocation', row.prepare);
    check(prepared.state === 'ready' && prepared.authority === 'committed' && prepared.device?.udid && prepared.allocationId, 'PREPARATION_NOT_READY');
    const device = prepared.device.udid;
    const action = { ...row.action, version: 1, actionId: row.prepare.actionId, allocationId: prepared.allocationId };
    const actionFile = requestFile(rowDir, 'action', action);
    await readinessBarrier({ plan, dispatch, row, rowDir, prepared, action, gate });
    const result = ['L01', 'L05'].includes(row.id)
      ? (await cli(row, 'action', 'observed-action', actionFile, device)).reply
      : await mcp(row, 'action', 'start_observed_action', action, device, true);
    assertResult(row, result);
    const retrieved = ['L01', 'L05'].includes(row.id)
      ? await mcp(row, 'silent', 'get_observed_action', { actionId: action.actionId }, device)
      : (await cli(row, 'silent', 'observed-report', action.actionId, device)).reply;
    assertResult(row, retrieved);
    if (row.id === 'L04') {
      const repeat = await cli(row, 'silent', 'observed-action', actionFile, device); assertResult(row, repeat.reply);
      const conflict = requestFile(rowDir, 'conflict', { ...action, timeoutMs: 10001 });
      const refused = await cli(row, 'silent', 'observed-action', conflict, device);
      check(refused.reply.code === 'ACTION_ID_CONFLICT', 'CONFLICT_NOT_REFUSED');
      const legacy = { version: 1, platform: 'ios', app: { bundleId: row.prepare.app.bundleId }, device: { udid: device }, values: {},
        steps: [{ id: 'quarantineGate', kind: 'wait', guard: { present: [{ identifier: 'home.heading' }] },
          until: { present: [{ identifier: 'home.heading' }] }, timeoutMs: 100 }] };
      await legacySuccessor(row, requestFile(rowDir, 'legacy-successor', legacy), device);
    }
    json(path.join(rowDir, 'public-oracle.json'), { status: 'PUBLIC_ORACLE_MATCHED_PENDING_ROOT_COUNT_AND_VISIBLE_AUDIT', prepared, result, retrieved });
  }
  json(path.join(plan.evidenceDir, 'controller-complete.json'), { status: 'PUBLIC_ROWS_COMPLETE_PENDING_ROOT_AUDIT', at: new Date().toISOString() });
} catch (error) { gate.fail(error.message); process.exitCode = 3; throw error; }
