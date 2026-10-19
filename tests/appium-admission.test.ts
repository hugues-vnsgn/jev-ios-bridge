import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Admission, admissionRoot } from '../src/device/admission.js';

const worker = fileURLToPath(new URL('./fixtures/appium-admission-worker.ts', import.meta.url));
const provider = fileURLToPath(new URL('./fixtures/appium-protocol-provider.mjs', import.meta.url));
const device = '40A5E14C-7B08-43A0-844A-76FB94B4B34A';
function command(child: ChildProcess, message: object): Promise<any> {
  const received = once(child, 'message'); child.send(message); return received.then(([value]) => value);
}

test('competing Appium tracers share admission and only the winning process can reach the device provider', async t => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'appium-admission-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const authority = join(directory, 'authority');
  mkdirSync(authority, { mode: 0o700 });
  const admission = Admission.forTesting({ root: authority, backend: 'fake' });
  const alias = join(directory, 'authority-alias'); symlinkSync(authority, alias);
  const wires: string[] = [], children: ChildProcess[] = [];
  for (let i = 0; i < 2; i++) {
    const working = join(directory, 'work-' + i); mkdirSync(working);
    const wire = join(working, 'wire.json'); wires.push(wire); writeFileSync(wire, '[]');
    const config = join(working, 'config.json');
    writeFileSync(config, JSON.stringify({ platform: 'ios', provider: { command: process.execPath, args: [provider, 'none', 'ios', wire] } }));
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), worker, i === 0 ? authority : alias, config], { cwd: working, env: { PATH: process.env.PATH!, HOME: working, TMPDIR: working }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    children.push(child);
    t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
    let stderr = ''; child.stderr!.on('data', value => { stderr += value; });
    const ready = await Promise.race([once(child, 'message'), once(child, 'exit').then(() => { throw new Error(stderr); })]);
    assert.equal(ready[0].ready, true);
    assert.equal(ready[0].productionRoot, admissionRoot());
  }
  const requests = children.map((_, i) => ({ device: i === 0 ? device.toLowerCase() : device, attempt: { kind: i === 0 ? 'observed' : 'legacy', id: 'appium-owner-' + i }, digest: 'one-fixed-request', intent: { target: 'choose.apple' } }));
  const acquired = await Promise.all(children.map((child, i) => command(child, { operation: 'acquire', request: requests[i] })));
  assert.deepEqual(acquired.map(x => x.kind).sort(), ['acquired', 'refused']);
  const winner = acquired.findIndex(x => x.kind === 'acquired');
  assert.equal(acquired[1 - winner].reason, 'DEVICE_BUSY');
  assert.deepEqual(await command(children[1 - winner]!, { operation: 'execute' }), { status: 'refused', reason: 'NO_ADMISSION' });
  assert.deepEqual(JSON.parse(readFileSync(wires[1 - winner]!, 'utf8')), []);
  const result = await command(children[winner]!, { operation: 'execute' });
  assert.equal(result.protocol.status, 'passed-host-protocol');
  assert.equal(result.authority, 'committed');
  const wire = JSON.parse(readFileSync(wires[winner]!, 'utf8')) as { name: string }[];
  assert.equal(wire.filter(x => x.name === 'appium_gesture').length, 1);
  assert.equal(admission.inspect(device)?.state, 'quarantined');
  assert.equal(admission.readAttempt(requests[winner]!.attempt as { kind: 'observed' | 'legacy'; id: string })?.terminal?.outcome, 'inconclusive');
  assert.equal((await command(children[1 - winner]!, { operation: 'acquire', request: requests[1 - winner] })).reason, 'DEVICE_QUARANTINED');
  const retrieval = await command(children[1 - winner]!, { operation: 'acquire', request: requests[winner] });
  assert.equal(retrieval.kind, 'retrieved');
  assert.deepEqual(await command(children[winner]!, { operation: 'execute' }), { status: 'refused', reason: 'DISPATCH_CLOSED' });
  assert.deepEqual(JSON.parse(readFileSync(wires[winner]!, 'utf8')), wire);
});
