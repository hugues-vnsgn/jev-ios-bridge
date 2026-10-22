import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import { commandSchema, messageSchema, faultSchema, type CommandInput, type Control, type CoreReply } from './admission-core-protocol.js';

export async function bounded<T>(name: string, work: Promise<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name}: deadline exceeded`)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
export async function barrier(path: string) {
  const deadline = performance.now() + 10000;
  while (!existsSync(path)) {
    assert.ok(performance.now() < deadline, `barrier ${path}: deadline exceeded`);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}
export async function coreWorker(t: TestContext, root: string, options: { operation?: string; point?: string; control?: Control } = {}) {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('./admission-core-worker.ts', import.meta.url)), root,
    options.operation ?? '', options.point ?? '', ...(options.control ? [JSON.stringify(options.control)] : [])],
  { stdio: ['ignore', 'ignore', 'pipe', 'ipc', 'pipe'], env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' } });
  let stderr = '', fault = '', sequence = 0;
  child.stderr!.on('data', data => { stderr += data; });
  child.stdio[4]?.on('data', data => { fault += data; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await bounded(`${t.name} worker cleanup`, closed);
  });
  await bounded(`${t.name} worker ready`, new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`worker exited before ready: ${stderr}`)));
    child.once('message', raw => {
      const message = messageSchema.parse(raw);
      assert.equal(message.type, 'ready'); assert.equal(message.actor, child.pid); resolve();
    });
  }));
  function send(command: CommandInput) {
    const requestId = ++sequence;
    child.send(commandSchema.parse({ ...command, requestId }));
    return requestId;
  }
  async function exchange(command: Exclude<CommandInput, { operation: 'exit' }>): Promise<CoreReply> {
    const result = new Promise<CoreReply>((resolve, reject) => {
      const onExit = () => { child.off('message', onMessage); reject(new Error(`worker exited: ${stderr}`)); };
      const onMessage = (raw: unknown) => {
        child.off('exit', onExit);
        try {
          const message = messageSchema.parse(raw);
          assert.equal(message.type, 'reply');
          if (message.type !== 'reply') throw new Error('Expected reply');
          assert.equal(message.requestId, sequence); assert.equal(message.actor, child.pid); assert.equal(message.operation, command.operation);
          resolve(message);
        } catch (error) { reject(error); }
      };
      child.once('exit', onExit); child.once('message', onMessage);
      send(command);
    });
    return bounded(`${t.name} ${command.operation} reply`, result);
  }
  return { child, exchange, send, async killed() {
    const exit = await bounded(`${t.name} fault exit`, closed);
    assert.deepEqual(exit, { code: null, signal: 'SIGKILL' }, stderr);
    return faultSchema.parse(JSON.parse(fault));
  } };
}
