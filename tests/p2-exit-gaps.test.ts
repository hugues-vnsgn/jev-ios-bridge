import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { z } from 'zod/v4';
import { Admission } from '../src/device/admission.js';
import { resolveIdentity } from '../src/device/identity.js';
import { identityProbe } from '../src/device/android/probe.js';
import { recoverAndroid } from '../src/device/android/recovery.js';
import type { LogcatStarter } from '../src/device/android/logcat.js';
import { bounded } from './fixtures/admission-race-harness.js';
import { fakeProbeSpawn } from './fixtures/adb-spawn.js';
import { FakeAdb, FakeStreams } from './fixtures/android-device.js';

function fixture(t: TestContext) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'p2-exit-gaps-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'admission'), { mode: 0o700 });
  const admission = Admission.forTesting({ root: join(root, 'admission'), backend: 'fake', durability: 'full' });
  return { root, admission, database: () => readFileSync(join(root, 'admission/admission.sqlite')) };
}

const messageSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready') }),
  z.strictObject({ kind: z.literal('backend') }),
  z.strictObject({ kind: z.literal('result'), reason: z.string(), calls: z.number(), agentCalls: z.number() }),
]);
async function owner(t: TestContext, root: string, mode: string, name = '', components = '') {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'),
    new URL('./fixtures/p2-gap-owner.ts', import.meta.url).pathname, root, mode, name, components],
  { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  let stderr = '';
  child.stderr!.on('data', data => { stderr += data; });
  const messages: z.infer<typeof messageSchema>[] = [];
  const waiting = new Set<() => void>();
  child.on('message', raw => { messages.push(messageSchema.parse(raw)); for (const wake of waiting) wake(); });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once('close', (code, signal) => {
    resolve({ code, signal }); for (const wake of waiting) wake();
  }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await bounded(`${mode} owner cleanup`, closed);
  });
  async function next(kind: z.infer<typeof messageSchema>['kind']) {
    let wake = () => {};
    try {
      return await bounded(`${mode} owner ${kind}`, new Promise<z.infer<typeof messageSchema>>((resolve, reject) => {
        wake = () => {
          const index = messages.findIndex(message => message.kind === kind);
          if (index >= 0) resolve(messages.splice(index, 1)[0]!);
          else if (child.exitCode !== null || child.signalCode !== null) reject(new Error(`${mode} exited before ${kind}: ${stderr}`));
        };
        waiting.add(wake); wake();
      }));
    } finally { waiting.delete(wake); }
  }
  await next('ready');
  return { child, closed, next, start: () => child.send('start'), release: () => child.send('release'),
    async exit() { assert.deepEqual(await bounded(`${mode} owner exit`, closed), { code: 0, signal: null }, stderr); } };
}

test('E3 cross-process Android scripted and capture owners exclude AVD/serial aliases without losing effects', { timeout: 60000 }, async t => {
  for (const winner of ['scripted', 'capture'] as const) await t.test(`${winner} wins`, async t => {
    const { root, admission, database } = fixture(t);
    const scripted = await owner(t, root, 'scripted', 'Pixel');
    const capture = await owner(t, root, 'capture', 'emulator-5554');
    const first = winner === 'scripted' ? scripted : capture;
    const second = winner === 'scripted' ? capture : scripted;
    first.start();
    await first.next('backend');
    const before = database();
    const state = admission.inspect({ category: 'android-emulator', value: '/fake/avds/Pixel.avd' });
    assert.equal(state?.state, 'active');
    assert.equal(state.owner?.process.pid, first.child.pid);
    second.start();
    const refused = await second.next('result');
    assert.deepEqual(refused, { kind: 'result', reason: 'DEVICE_BUSY', calls: 0, agentCalls: 0 });
    await second.exit();
    assert.deepEqual(database(), before, 'loser leaves the complete admission database unchanged');
    assert.deepEqual(admission.inspect({ category: 'android-emulator', value: '/fake/avds/Pixel.avd' }), state);
    first.release();
    const completed = await first.next('result');
    assert.equal(completed.kind, 'result');
    if (completed.kind !== 'result') throw new Error('Expected winner result');
    assert.equal(completed.reason, 'passed');
    assert.ok(completed.calls > 0);
    await first.exit();
    assert.equal(admission.inspect({ category: 'android-emulator', value: '/fake/avds/Pixel.avd' })?.state, 'available');
  });
});

async function hostProcess(t: TestContext, label: string) {
  const child = spawn(process.execPath, ['-e', "process.on('message', () => {}); process.send('ready');"],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], env: {} });
  const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await bounded(`E10 ${label} cleanup`, closed);
  });
  await bounded(`E10 ${label} started`, new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', () => reject(new Error(`${label} exited before ready`)));
    child.once('message', raw => { assert.equal(raw, 'ready'); resolve(); });
  }));
  assert.ok(child.pid);
  const host = { pid: child.pid, incarnation: execFileSync('/bin/ps', ['-p', String(child.pid), '-o', 'lstart='],
    { encoding: 'utf8', timeout: 1000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', TZ: 'UTC' } }).trim() };
  return { child, process: host, closed, async stop() {
    child.kill('SIGTERM');
    await bounded(`E10 ${label} stop`, closed);
  } };
}

test('E10 killed Android owner with outstanding adb, live agent and stream requires every stop proof at next admission', { timeout: 60000 }, async t => {
  for (const missing of [null, 'adb', 'agent', 'stream'] as const) await t.test(missing === null ? 'complete evidence' : `missing ${missing} evidence`, async t => {
    const { root, admission, database } = fixture(t);
    const adbHost = await hostProcess(t, 'outstanding adb');
    const stream = await hostProcess(t, 'live stream');
    const old = await owner(t, root, 'crash', '', JSON.stringify([
      { kind: 'host-start', process: adbHost.process },
      { kind: 'agent-start', pid: 4675, startTime: '12345' },
      { kind: 'host-start', process: stream.process },
    ]));
    old.start(); await old.next('backend');
    const identity = { category: 'android-emulator' as const, value: '/fake/avds/Pixel.avd' };
    const previous = admission.inspect(identity)?.owner;
    assert.ok(previous);
    const before = admission.readGeneration(previous);
    assert.equal(before.commands.length, 1);
    assert.equal(before.commands[0]?.state, 'outstanding');
    assert.deepEqual(before.components.map(component => component.id).sort(), ['adb', 'agent', 'stream']);
    const agents = new Map<number, 'own'>([[4675, 'own']]);
    const adb = new FakeAdb({ serial: 'emulator-5554', avd: 'Pixel', agents });
    const streams: LogcatStarter = new FakeStreams(adb);
    streams.kill = async (pid, expected) => {
      assert.equal(pid, stream.process.pid); assert.deepEqual(expected, stream.process);
      await stream.stop();
    };
    const bytes = database();
    old.child.kill('SIGKILL');
    assert.deepEqual(await bounded('E10 owner SIGKILL exit', old.closed), { code: null, signal: 'SIGKILL' });
    assert.deepEqual(database(), bytes, 'owner death alone changes no durable authority');
    assert.equal(admission.componentState(adbHost.process), 'alive');
    assert.equal(admission.componentState(stream.process), 'alive');
    assert.equal(agents.has(4675), true);
    await adbHost.stop();
    let sweeps = 0, offered = 0;
    let sweepError: unknown;
    const result = await bounded('E10 next admission recovery', admission.acquireWithRecovery({ category: identity.category, device: identity.value,
      attempt: { kind: 'legacy', id: 'successor' }, digest: 'successor', intent: {} }, async claim => {
      sweeps++;
      assert.deepEqual(claim.identity.owner, previous);
      assert.equal(admission.inspect(identity)?.state, 'quarantined');
      assert.equal(admission.readAttempt({ kind: 'legacy', id: 'successor' }), undefined);
      const proof = await recoverAndroid({ admission, claim, serial: 'emulator-5554',
        runner: (args, signal) => adb.run(args[2] === 'shell' && args.length > 4
          ? [...args.slice(0, 3), args.slice(3).join(' ')] : args, signal), logcat: streams,
        revalidate: async () => {
          const resolved = await resolveIdentity({ request: { category: 'android', name: 'emulator-5554' }, probe: adb.identityProbe, signal: t.signal });
          assert.equal(resolved.value, identity.value);
          assert.equal(admission.inspect(identity)?.state, 'quarantined');
        }, signal: t.signal }).catch(error => { sweepError = error; throw error; });
      assert.equal(admission.componentState(adbHost.process), 'exited');
      assert.equal(admission.componentState(stream.process), 'exited');
      assert.equal(agents.has(4675), false);
      const kinds = new Map(proof.components.map(component => [component.componentId, component.proof.kind]));
      assert.equal(kinds.get('adb'), 'adb-stopped');
      assert.equal(kinds.get('agent'), 'android-component-stopped');
      assert.equal(kinds.get('stream'), 'android-stream-exited');
      assert.deepEqual(proof.commands, [before.commands[0]!.id]);
      assert.equal(admission.readAttempt({ kind: 'legacy', id: 'successor' }), undefined, 'sweep alone never admits the successor');
      offered++;
      return { ...proof, components: proof.components.filter(component => component.componentId !== missing) };
    }));
    assert.equal(sweeps, 1);
    assert.equal(offered, 1, String(sweepError));
    const recovered = admission.readGeneration(previous);
    assert.equal(recovered.commands.find(command => command.requestId === 'outstanding-adb')?.state, 'uncertain');
    assert.equal(admission.readAttempt(previous.attempt)?.terminal?.outcome, 'inconclusive');
    if (missing === null) {
      assert.equal(result.kind, 'acquired', String(sweepError));
      assert.deepEqual(recovered.recoveries.map(recovery => recovery.closure), ['accepted']);
      assert.equal(admission.inspect(identity)?.generation, previous.generation + 1);
    } else {
      assert.deepEqual(result, { kind: 'refused', reason: 'DEVICE_QUARANTINED' });
      assert.deepEqual(recovered.recoveries.map(recovery => recovery.closure), ['refused']);
      assert.equal(admission.inspect(identity)?.state, 'quarantined');
      assert.equal(admission.inspect(identity)?.generation, previous.generation);
      assert.equal(admission.readAttempt({ kind: 'legacy', id: 'successor' }), undefined);
    }
  });
});

test('E4 two ini files naming one AVD content directory resolve to one identity and refuse a second owner', { timeout: 10000 }, async t => {
  const { root, admission, database } = fixture(t);
  const content = join(root, 'shared.avd');
  mkdirSync(content);
  for (const name of ['Pixel', 'Alias']) writeFileSync(join(root, `${name}.ini`), `avd.ini.encoding=UTF-8\npath=${content}\n`);
  const consolePath = (name: string) => {
    const match = /^path=(.+)$/m.exec(readFileSync(join(root, `${name}.ini`), 'utf8'));
    assert.ok(match);
    return match[1]!;
  };
  const fake = fakeProbeSpawn((_file, args) => {
    if (args[0] === 'devices') return 'List of devices attached\nemulator-5554 device\nemulator-5556 device\n';
    const name = args[1] === 'emulator-5554' ? 'Pixel' : 'Alias';
    if (args[2] === 'emu') return `${args[4] === 'path' ? consolePath(name) : name}\r\nOK\r\n`;
    return `${name}\n`;
  });
  const probe = identityProbe({ adb: '/fake/adb', environment: {}, spawn: fake.spawn, host: {
    listener: async port => ({ pid: port, startedAt: '2026-10-19T01:00:00.000Z', uid: 501, local: true }),
    directory: async path => {
      const canonical = realpathSync(path), stat = statSync(canonical, { bigint: true });
      return { path: canonical, device: String(stat.dev), inode: String(stat.ino) };
    },
    version: async () => ({ value: '36.6.1', source: 'running-sdk-binary' }),
  } });
  const first = await bounded('E4 first ini resolution', resolveIdentity({ request: { category: 'android', name: 'Pixel' }, probe, signal: t.signal }));
  assert.equal(first.category, 'android-emulator');
  if (first.category !== 'android-emulator') throw new Error('Expected emulator');
  const acquired = admission.acquire({ category: first.category, device: first.value, provenance: first.provenance,
    attempt: { kind: 'legacy', id: 'first-ini' }, digest: 'first-ini', intent: first });
  assert.equal(acquired.kind, 'acquired');
  const before = database();
  const second = await bounded('E4 second ini resolution', resolveIdentity({ request: { category: 'android', name: 'Alias' }, probe, signal: t.signal }));
  assert.equal(second.category, 'android-emulator');
  if (second.category !== 'android-emulator') throw new Error('Expected emulator');
  assert.deepEqual([first.value, second.value], [content, content]);
  assert.deepEqual(first.provenance.directory, second.provenance.directory);
  assert.deepEqual([first.provenance.avdName, second.provenance.avdName], ['Pixel', 'Alias']);
  assert.deepEqual(admission.acquire({ category: second.category, device: second.value, provenance: second.provenance,
    attempt: { kind: 'legacy', id: 'second-ini' }, digest: 'second-ini', intent: second }), { kind: 'refused', reason: 'DEVICE_BUSY' });
  assert.deepEqual(database(), before, 'ini alias refusal leaves admission unchanged');
});
