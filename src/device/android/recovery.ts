import { randomUUID } from 'node:crypto';
import { componentObservationSchema, componentSchema, type Admission, type FenceRequest, type RecoveryClaim } from '../admission.js';
import type { AdbResult, AdbRunner } from './adb.js';
import type { LogcatStarter } from './logcat.js';

export const shellCommand = (serial: string, words: string[]): string[] => ['-s', serial, 'shell', words.map(word => `'${word.replaceAll("'", "'\\''")}'`).join(' ')];
export function androidStartTime(stat: string): string | undefined {
  const match = /^\d+ \(.*\) ([A-Z]) (.+)\n?$/.exec(stat);
  const fields = match?.[2]?.trim().split(/\s+/);
  const value = fields?.[18];
  return value && /^\d+$/.test(value) ? value : undefined;
}
export function processGone(result: AdbResult): boolean {
  return result.exitCode !== 0 && result.stdout === '' && /No such file or directory/.test(result.stderr);
}

export async function recoverAndroid(input: {
  admission: Admission; claim: RecoveryClaim; serial: string; runner: AdbRunner; logcat: LogcatStarter;
  revalidate: () => Promise<void>; signal: AbortSignal;
}): Promise<FenceRequest> {
  const { admission, claim, serial, runner, signal } = input;
  const original = admission.readGeneration(claim.identity.owner);
  const proofs: FenceRequest['components'] = [];
  const query = async (args: string[]) => {
    signal.throwIfAborted();
    await input.revalidate();
    const id = randomUUID();
    const result = await claim.dispatch({ requestId: id, componentId: id, operation: 'adb-recovery', payload: {}, recordResult: true,
      components: [{ id, kind: 'adb-command', serial, args }] },
      () => runner(args, signal, process => claim.observeComponent(id, { kind: 'host-start', process })));
    const command = admission.readGeneration(claim.identity.owner).commands.find(command => command.componentId === id)!;
    proofs.push({ componentId: id, proof: { kind: 'completed-command', commandId: command.id } });
    return { result, commandId: command.id };
  };
  for (const native of original.components) {
    const component = componentSchema.parse(native.declaration);
    const commands = original.commands.filter(command => command.componentId === component.id);
    const completed = commands.find(command => command.state === 'settled');
    if ((component.kind === 'one-shot' || component.kind === 'adb-command') && completed && commands.every(command => command.state === 'settled')) {
      proofs.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: completed.id } });
      continue;
    }
    const observations = original.componentObservations.filter(observation => observation.componentId === component.id)
      .flatMap(observation => { const parsed = componentObservationSchema.safeParse(observation.payload); return parsed.success ? [parsed.data] : []; });
    if (component.kind === 'adb-command' || component.kind === 'android-stream') {
      if (component.serial !== serial) throw new Error('Recorded transport differs');
      const started = observations.find(observation => observation.kind === 'host-start');
      if (!started || started.kind !== 'host-start') throw new Error('Missing recorded host incarnation');
      let state = admission.componentState(started.process);
      if (component.kind === 'android-stream' && state === 'alive') {
        await input.logcat.kill(started.process.pid, started.process);
        state = admission.componentState(started.process);
      }
      if (state !== 'exited') throw new Error('Host exit is not proven');
      if (component.kind === 'android-stream') proofs.push({ componentId: component.id, proof: { kind: 'android-stream-exited', process: started.process } });
      else {
        const listed = await query(['-s', serial, 'shell', 'ps', '-A', '-o', 'PID,NAME,ARGS']);
        proofs.push({ componentId: component.id, proof: { kind: 'adb-stopped', process: started.process, commandId: listed.commandId } });
      }
    } else if (component.kind === 'android-agent') {
      if (component.serial !== serial) throw new Error('Recorded transport differs');
      const started = observations.find(observation => observation.kind === 'agent-start');
      if (!started || started.kind !== 'agent-start') throw new Error('Agent identity is incomplete');
      const statArgs = shellCommand(serial, ['cat', `/proc/${started.pid}/stat`]);
      let observed = await query(statArgs);
      if (!processGone(observed.result)) {
        if (observed.result.exitCode !== 0 || androidStartTime(observed.result.stdout) !== started.startTime) throw new Error('Agent PID is reused or unreadable');
        const environment = await query(shellCommand(serial, ['cat', `/proc/${started.pid}/environ`]));
        if (environment.result.exitCode !== 0 || !environment.result.stdout.split('\0').includes(`CLASSPATH=${component.classpath}`)) throw new Error('Agent binding differs');
        await query(shellCommand(serial, ['kill', String(started.pid)]));
        observed = await query(statArgs);
      }
      if (!processGone(observed.result)) throw new Error('Agent exit is not proven');
      proofs.push({ componentId: component.id, proof: { kind: 'android-component-stopped', commandId: observed.commandId } });
    } else if (component.kind === 'android-forward') {
      if (component.serial !== serial) throw new Error('Recorded transport differs');
      const listed = await query(['forward', '--list']);
      if (listed.result.exitCode !== 0) throw new Error('Forward inventory unavailable');
      const mapping = listed.result.stdout.split('\n').map(line => line.trim().split(/\s+/)).find(row => row[0] === serial && row[1] === component.local);
      if (mapping) {
        if (mapping[2] !== component.remote) throw new Error('Forward binding differs');
        await query(['-s', serial, 'forward', '--remove', component.local]);
      }
      const after = await query(['forward', '--list']);
      proofs.push({ componentId: component.id, proof: { kind: 'android-component-stopped', commandId: after.commandId } });
    } else throw new Error('No supported stop proof for this component');
  }
  const view = admission.readGeneration(claim.identity.owner);
  for (const component of view.components) {
    if (proofs.some(proof => proof.componentId === component.id)) continue;
    const completed = view.commands.find(command => command.componentId === component.id && command.state === 'settled');
    if ((component.kind === 'one-shot' || component.kind === 'adb-command') && completed) proofs.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: completed.id } });
  }
  return { requestId: randomUUID(), kind: 'stop', components: proofs, commands: view.commands.filter(command => command.state !== 'settled').map(command => command.id) };
}
