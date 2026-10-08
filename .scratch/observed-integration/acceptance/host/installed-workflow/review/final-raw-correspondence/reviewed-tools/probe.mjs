// Supplement H07 with the actual installed production factory's open-error mapping.
// The accepted guard throws before Admission.open can touch account authority.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
const [proofArgument, outputArgument] = process.argv.slice(2);
assert.ok(proofArgument && outputArgument);
process.umask(0o077);
const proof = resolve(proofArgument), output = resolve(outputArgument);
assert.ok(!existsSync(output), 'Preserve prior probe evidence');
mkdirSync(output, { recursive: true, mode: 0o700 });
const installed = join(proof, 'clean/node_modules/jev-ios-bridge');
const cli = join(installed, 'dist/cli.js');
const cwd = join(proof, 'clean');
const guard = '/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/tests/fixtures/observed-packaging/guard.mjs';
const summary = JSON.parse(readFileSync(join(proof, 'summary.json'), 'utf8'));
assert.equal(summary.status, 'PASS'); assert.equal(summary.node, process.version);
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
for (const [file, digest] of Object.entries(summary.installed)) assert.equal(sha(join(installed, file)), digest);
const env = { ...process.env, PATH: dirname(process.execPath) + ':' + process.env.PATH, JEV_EXPERIMENTAL_OBSERVED: '0' };
delete env.TYPESAFE_API_KEY; delete env.NODE_OPTIONS; delete env.NODE_NO_WARNINGS;
const records = [];
const owned = new Set();
const readers = new Set();
function launch(label, args) {
  const guardLog = join(output, label + '-guard.jsonl'); writeFileSync(guardLog, '');
  const before = process.umask(0o022);
  let child;
  try { child = spawn(process.execPath, ['--import', guard, cli, ...args], { cwd, env: { ...env, JEV_PACKAGING_GUARD_LOG: guardLog }, stdio: ['pipe', 'pipe', 'pipe'] }); }
  finally { process.umask(before); }
  let stdout = '', stderr = '';
  let stdinError;
  child.stdin.on('error', error => {
    stdinError = { name: error.name, message: error.message };
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 12000);
  let spawnError;
  child.once('error', error => { spawnError = { name: error.name, message: error.message }; });
  const exited = new Promise(done => {
    child.once('close', (code, signal) => {
      clearTimeout(timer); writeFileSync(join(output, label + '.stdout'), stdout); writeFileSync(join(output, label + '.stderr'), stderr);
      const record = { label, command: [process.execPath, '--import', guard, cli, ...args], cwd, node: process.version, childUmask: '0022', code, signal, spawnError, stdinError, stdout: label + '.stdout', stderr: label + '.stderr', guardLog: label + '-guard.jsonl' };
      records.push(record); done({ ...record, stdout, stderr });
    });
  });
  const operation = { child, exited, guardLog }; owned.add(operation); return operation;
}
async function closeOwned() {
  for (const operation of owned) {
    if (operation.child.exitCode === null && operation.child.signalCode === null) operation.child.stdin.end();
    const deadline = setTimeout(() => {
      if (operation.child.exitCode === null && operation.child.signalCode === null) operation.child.kill('SIGKILL');
    }, 1000);
    try { await operation.exited; } finally { clearTimeout(deadline); }
  }
  for (const reader of readers) reader.close();
}
function assertPublicSafe(outputValue) {
  assert.ok(!outputValue.includes('Installed smoke attempted forbidden effect'), 'Injected private exception must not escape public output');
}
function assertReply(reply, kind) {
  assert.equal(reply.version, 1); assert.equal(reply.kind, 'observed-operation-error');
  assert.equal(reply.code, 'STORE_UNAVAILABLE'); assert.equal(reply.message, 'Existing admission authority is unavailable');
  assert.equal(reply.acceptance, 'unknown'); assert.equal(reply.acceptanceKind, kind);
  assert.ok(!JSON.stringify(reply).includes('Installed smoke attempted forbidden effect'));
}
function assertOnlyOpen(path) {
  const effects = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(effects, [{ forbidden: 'Admission.open' }]);
}
try {
  const allocationId = 'ABCDEF00-0000-4000-8000-000000000099';
  for (const [label, command, value, kind] of [['cli-allocation', 'observed-allocation', allocationId, 'preparation'], ['cli-action', 'observed-report', 'store-fault', 'action']]) {
    const operation = launch(label, [command, value, '--json']); operation.child.stdin.end();
    const result = await operation.exited; assert.equal(result.code, 3); assert.equal(result.signal, null);
    assert.equal(result.stdinError, undefined);
    assertPublicSafe(result.stdout + result.stderr);
    assert.equal(result.stdout.trim().split('\n').length, 1); assertReply(JSON.parse(result.stdout), kind); assertOnlyOpen(operation.guardLog);
  }
  const server = launch('mcp', ['mcp']); const pending = new Map(); let nextId = 0;
  const lines = createInterface({ input: server.child.stdout });
  readers.add(lines);
  let protocolError;
  lines.on('line', line => {
    try { const reply = JSON.parse(line); const handler = pending.get(reply.id); if (handler) { pending.delete(reply.id); handler.done(reply); } }
    catch (error) { protocolError = error; rejectPending(error); server.child.stdin.end(); }
  });
  const rejectPending = error => { for (const handler of pending.values()) handler.fail(error); pending.clear(); };
  server.child.once('error', rejectPending);
  server.child.once('close', (code, signal) => rejectPending(new Error(`MCP closed before reply: code=${code} signal=${signal}`)));
  const sent = [];
  const rpc = (method, params) => new Promise((done, fail) => {
    const id = ++nextId; pending.set(id, { done, fail }); const message = { jsonrpc: '2.0', id, method, params }; sent.push(message);
    writeFileSync(join(output, 'mcp-requests.jsonl'), sent.map(r => JSON.stringify(r)).join('\n') + '\n');
    server.child.stdin.write(JSON.stringify(message) + '\n');
  });
  const init = await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'root-store-fault', version: '1' } });
  assert.equal(init.result.serverInfo.name, 'jev-ios-bridge');
  server.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  for (const [name, argumentsValue, kind] of [['get_observed_allocation', { allocationId }, 'preparation'], ['get_observed_allocation', { allocationId }, 'preparation'], ['get_observed_action', { actionId: 'store-fault' }, 'action']]) {
    const response = await rpc('tools/call', { name, arguments: argumentsValue });
    assertPublicSafe(JSON.stringify(response));
    assert.equal(response.result.isError, true); assert.equal(response.result.content.length, 2);
    for (const block of response.result.content) assert.equal(block.type, 'text');
    assert.ok(response.result.content[0].text.includes('STORE_UNAVAILABLE')); assert.ok(response.result.content[0].text.includes('Existing admission authority is unavailable'));
    assertReply(JSON.parse(response.result.content[1].text), kind); assertOnlyOpen(server.guardLog);
  }
  server.child.stdin.end(); const stopped = await server.exited; lines.close(); assert.equal(stopped.code, 0); assert.equal(stopped.signal, null); assertOnlyOpen(server.guardLog);
  assert.equal(stopped.stdinError, undefined);
  assertPublicSafe(stopped.stdout + stopped.stderr); if (protocolError) throw protocolError;
  writeFileSync(join(output, 'mcp-requests.jsonl'), sent.map(r => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(join(output, 'commands.json'), JSON.stringify(records, null, 2) + '\n');
  const result = { status: 'PASS', node: process.version, installedProof: proof, injectedBoundary: 'Admission.open before any account store access', loader: guard, loaderSha256: sha(guard), cliCommands: 2, mcpCalls: 3, cliOpenAttemptsPerProcess: 1, mcpOpenAttemptsSameComposition: 1, sdkDriverChildEffects: 0, productionAccountRootOperations: 0, limits: ['Injected production factory open-error translation; not actual account-root corruption/missing-store experiment.', 'Isolated actual SQLite failure evidence is supplied separately by ticket09.', 'Per-process/composition caching; no cross-process one-open guarantee.'] };
  writeFileSync(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result));
} catch (error) {
  await closeOwned();
  writeFileSync(join(output, 'commands.json'), JSON.stringify(records, null, 2) + '\n');
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ status: 'FAIL', node: process.version, message: String(error) }, null, 2) + '\n');
  throw error;
} finally {
  await closeOwned();
}
