import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { AdbChild, AdbSpawn } from '../../src/device/android/adb.js';

/** A fake `adb` child for the production runner: it exits when the test says. The runner can't kill it. */
export class FakeChild extends EventEmitter implements AdbChild {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exit(code: number, stdout = '', stderr = ''): void {
    this.stdout.end(stdout);
    this.stderr.end(stderr);
    setImmediate(() => this.emit('close', code, null));
  }
}

export type SpawnCall = { file: string; args: readonly string[]; options: Parameters<AdbSpawn>[2] };

/** A spawn that records each call and hands back a `FakeChild`; `onSpawn` may drive the child. */
export function fakeSpawn(onSpawn?: (child: FakeChild, args: readonly string[]) => void): { spawn: AdbSpawn; calls: SpawnCall[]; child: () => FakeChild } {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  return {
    calls,
    child: () => children.at(-1)!,
    spawn: (file, args, options) => {
      calls.push({ file, args, options });
      const child = new FakeChild();
      children.push(child);
      onSpawn?.(child, args);
      return child;
    },
  };
}

import type { ProbeChild, ProbeSpawn } from '../../src/device/android/probe.js';

export class FakeProbeChild extends FakeChild implements ProbeChild {
  readonly killedBy: NodeJS.Signals[] = [];
  kill(signal: NodeJS.Signals): boolean {
    this.killedBy.push(signal);
    this.emit('close', null, signal);
    return true;
  }
}

export function fakeProbeSpawn(reply: (file: string, args: readonly string[], child: FakeProbeChild) => string | undefined): {
  spawn: ProbeSpawn; calls: { file: string; args: readonly string[]; options: Parameters<ProbeSpawn>[2] }[]; children: FakeProbeChild[];
} {
  const calls: { file: string; args: readonly string[]; options: Parameters<ProbeSpawn>[2] }[] = [];
  const children: FakeProbeChild[] = [];
  return { calls, children, spawn: (file, args, options) => {
    const child = new FakeProbeChild();
    calls.push({ file, args, options });
    children.push(child);
    setImmediate(() => { const stdout = reply(file, args, child); if (stdout !== undefined) child.exit(0, stdout); });
    return child;
  } };
}
