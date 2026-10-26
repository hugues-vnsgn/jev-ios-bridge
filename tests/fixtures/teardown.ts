import type { TestContext } from 'node:test';
import { rmSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';

const KILL_WAIT_MS = 10_000;

/** One test's teardown: the directory its children write under, and the children still to stop. */
interface Cleanup { directory: string; children: ChildProcess[]; stops: (() => void | Promise<void>)[] }
const cleanups = new WeakMap<TestContext, Cleanup>();

function closed(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(done => {
    child.once('close', () => done());
    child.once('error', () => done());
  });
}

function register(t: TestContext, cleanup: Cleanup): void {
  if (cleanups.has(t)) return;
  cleanups.set(t, cleanup);
  // One hook, registered before any child starts. node:test skips every later after hook once one
  // throws, so a removal that hits ENOTEMPTY must never come before the kills.
  t.after(async () => {
    for (const stop of cleanup.stops) await stop();
    await Promise.all(cleanup.children.map(async child => {
      const exited = closed(child);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await Promise.race([exited, new Promise(done => setTimeout(done, KILL_WAIT_MS))]);
    }));
    rmSync(cleanup.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
}

/** A test whose children write under `directory`: stop each child, wait for it to exit, then remove the
 *  directory. Call it as soon as the directory exists. The child list is held by reference, so a child
 *  pushed into it later is still stopped first; `killLater` and `stopLater` do the same for one child or
 *  one shutdown helper. */
export function teardown(t: TestContext, directory: string, children: readonly ChildProcess[] = [],
  stop?: () => void | Promise<void>): void {
  register(t, { directory, children: children as ChildProcess[], stops: stop ? [stop] : [] });
}

/** A child this test must kill before its directory goes, added after `teardown`. */
export function killLater(t: TestContext, child: ChildProcess): void {
  cleanups.get(t)?.children.push(child);
}

/** A shutdown helper this test must run before its directory goes, added after `teardown`. */
export function stopLater(t: TestContext, stop: () => void | Promise<void>): void {
  cleanups.get(t)?.stops.push(stop);
}
