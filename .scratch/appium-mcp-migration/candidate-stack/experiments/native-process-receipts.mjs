// Host lifecycle instrumentation; UI still uses the public Appium core.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdirSync, realpathSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
export function installNativeProcessReceipts(directory, ownerPath) {
  const root = realpathSync(directory);
  if ((lstatSync(root).mode & 0o077) !== 0) throw new Error('UNSAFE_COMPONENT_ROOT');
  mkdirSync(join(root, 'components'), { mode: 0o700 });
  const originals = Object.fromEntries(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'].map(name => [name, cp[name].bind(cp)]));
  const shim = fileURLToPath(new URL('./native-process-exec.py', import.meta.url));
  function invocation(command, args, options = {}) {
    let executable = command, values = args;
    if (options.shell) { executable = typeof options.shell === 'string' ? options.shell : '/bin/sh'; values = ['-c', [command, ...args].join(' ')]; }
    const { argv0, ...rest } = options;
    return ['python3', [shim, root, ownerPath, executable, argv0 ?? executable, ...values], { ...rest, env: { ...(options.env ?? process.env), JEV_PHASE1_RUN_MARKER: process.env.JEV_PHASE1_RUN_MARKER, JEV_PHASE1_ANCESTRY: process.env.JEV_PHASE1_ANCESTRY }, shell: false }];
  }
  for (const name of ['spawn', 'spawnSync', 'execFileSync']) cp[name] = (command, args = [], options = {}) => {
    if (!Array.isArray(args)) { options = args; args = []; }
    return originals[name](...invocation(command, args, options));
  };
  cp.execFile = (command, args = [], options = {}, callback) => {
    if (typeof args === 'function') { callback = args; args = []; options = {}; }
    else if (!Array.isArray(args)) { callback = typeof options === 'function' ? options : callback; options = args; args = []; }
    if (typeof options === 'function') { callback = options; options = {}; }
    return originals.execFile(...invocation(command, args, options), callback);
  };
  cp.exec = (command, options = {}, callback) => {
    if (typeof options === 'function') { callback = options; options = {}; }
    return originals.execFile(...invocation(command, [], { ...options, shell: options.shell ?? '/bin/sh' }), callback);
  };
  cp.execSync = (command, options = {}) => originals.execFileSync(...invocation(command, [], { ...options, shell: options.shell ?? '/bin/sh' }));
  cp.fork = () => { throw new Error('UNRECORDED_FORK_REFUSED'); };
  syncBuiltinESMExports();
  return originals;
}
