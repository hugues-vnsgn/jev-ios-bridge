import { execFile } from 'node:child_process';
import { z } from 'zod/v4';
import type { AdbResult } from '../../device/android/adb.js';
import { hostIdentitySchema, hostInventorySchema } from './schema.js';
import type { HostFenceIo } from './runner.js';

type HostCommand = (args: string[], signal: AbortSignal) => Promise<AdbResult>;
const runPs: HostCommand = (args, signal) => new Promise((resolve, reject) => {
  execFile('/bin/ps', args, { encoding: 'utf8', signal, timeout: 45000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', LANG: 'C', TZ: 'UTC' } }, (error, stdout, stderr) => {
    if (error) reject(new Error('Host inventory command failed'));
    else resolve({ stdout, stderr, exitCode: 0 });
  });
});
const chainSchema = z.array(z.union([
  hostIdentitySchema,
  z.strictObject({ pid: z.number().int().min(2), incarnation: z.string().min(1) })
    .transform(identity => hostIdentitySchema.parse({ pid: identity.pid, startTime: identity.incarnation })),
])).min(1).max(4096);
function ancestry(raw: string) {
  try { return chainSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))); }
  catch { throw new Error('Host launch ancestry is unprovable'); }
}
function inventory(stdout: string) {
  if (!stdout.trim()) throw new Error('Host inventory is empty');
  const rows = [];
  for (const line of stdout.trim().split(/\r?\n/)) {
    const match = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/.exec(line.trim());
    if (!match) throw new Error('Host inventory is truncated');
    const pid = Number(match[1]);
    if (pid < 2) continue;
    const command = match[6] ?? '';
    const marker = /(?:^|\s)JEV_PHASE1_RUN_MARKER=(\S+)(?:\s|$)/.exec(command)?.[1];
    const chain = /(?:^|\s)JEV_PHASE1_ANCESTRY=(\S+)(?:\s|$)/.exec(command)?.[1];
    const executable = command.split(/\s+/)[0];
    const sharedService = /(?:^|\/)CoreSimulatorService(?:\s|$)|(?:^|\/)com\.apple\.CoreSimulator\.CoreSimulatorService(?:\s|$)/.test(command)
      || ((executable?.split('/').at(-1) === 'adb') && /\bfork-server\b.*\bserver\b/.test(command));
    rows.push({ pid, ppid: Number(match[2]), pgid: Number(match[3]), state: match[4]?.startsWith('Z') ? 'zombie' : 'running',
      startTime: match[5], executable, ...(sharedService ? { sharedService: true } : {}),
      ...(marker === undefined ? {} : { runMarker: marker }), ...(chain === undefined ? {} : { launchChain: ancestry(chain) }) });
  }
  try { return hostInventorySchema.parse(rows); }
  catch { throw new Error('Host inventory is incomplete'); }
}
export function hostFenceIo(options: { run?: HostCommand; kill?: (pid: number, signal: 'SIGTERM' | 'SIGKILL') => void; controllerPid?: number } = {}): HostFenceIo {
  const run = options.run ?? runPs;
  const kill = options.kill ?? ((pid, signal) => { process.kill(pid, signal); });
  const controllerPid = options.controllerPid ?? process.pid;
  const query = async (args: string[], signal: AbortSignal) => {
    signal.throwIfAborted();
    const result = await run(args, signal);
    signal.throwIfAborted();
    if (result.exitCode !== 0 || result.stderr !== '') throw new Error('Host inventory command failed');
    return result.stdout;
  };
  const send = (pid: number, name: 'SIGTERM' | 'SIGKILL', signal: AbortSignal) => {
    signal.throwIfAborted();
    try { kill(pid, name); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error; }
  };
  return {
    inventory: async signal => inventory(await query(['-Eww', '-axo', 'pid=,ppid=,pgid=,stat=,lstart=,command='], signal)),
    signalGroup: async (pgid, name, signal) => {
      const group = z.coerce.number().int().min(1).parse((await query(['-p', String(controllerPid), '-o', 'pgid='], signal)).trim());
      if (pgid < 2 || pgid === group) throw new Error('Refuse controller process group');
      send(-pgid, name, signal);
    },
    signalProcess: async (identity, name, signal) => {
      if (identity.pid === controllerPid) throw new Error('Refuse controller process');
      send(identity.pid, name, signal);
    },
  };
}
