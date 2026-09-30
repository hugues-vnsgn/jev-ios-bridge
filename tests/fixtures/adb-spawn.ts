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
