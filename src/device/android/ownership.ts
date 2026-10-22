import { randomUUID } from 'node:crypto';
import { Admission, AdmissionError, componentSchema, componentObservationSchema, type AdmissionClaim, type AdmittedSession,
  type ComponentInput, type ComponentObservation, type FenceRequest, type RecoveryClaim } from '../admission.js';
import type { ProbeRecorder, ProbeInvocation } from './probe.js';
import type { AdbResult, AdbRunner } from './adb.js';
import { OutcomeUnknownError } from './ledger.js';

type Proof = FenceRequest['components'][number]['proof'];
export class AndroidOwnership {
  private session: AdmittedSession | undefined;
  private recovery: RecoveryClaim | undefined;
  private uncertain = false;
  private closed = false;
  private readonly proofs = new Map<string, Proof>();
  constructor(readonly admission: Admission, readonly claim: AdmissionClaim, readonly serial: string, backend: 'real' | 'fake') {
    this.session = claim.bindDriver(backend);
  }
  register(component: ComponentInput): void { (this.recovery ?? this.claim).registerComponent(component); }
  observe(id: string, observation: ComponentObservation): void { (this.recovery ?? this.claim).observeComponent(id, observation); }
  prove(id: string, proof: Proof): void { this.proofs.set(id, proof); }
  view() { return this.admission.readGeneration(this.claim.identity); }
  readonly probe: ProbeRecorder = Object.assign(async (file: string, args: string[], effect: ProbeInvocation['execute']) => {
    const dispatcher = this.recovery ?? this.session;
    if (!dispatcher) throw new AdmissionError('DISPATCH_CLOSED', 'Android dispatch is closed');
    try { return await dispatcher.dispatch(JSON.stringify({ kind: 'identity-probe', file, args }), effect); }
    catch (error) { this.uncertain = true; throw error; }
  }, { group: async (reads: ProbeInvocation[]) => {
    const dispatcher = this.recovery ?? this.session;
    if (!dispatcher) throw new AdmissionError('DISPATCH_CLOSED', 'Android dispatch is closed');
    try { return await dispatcher.dispatchReads(reads.map(({ file, args, execute }) => ({
      operation: JSON.stringify({ kind: 'identity-probe', file, args }), read: execute,
    }))); }
    catch (error) { this.uncertain = true; throw error; }
  } });
  async adb(args: string[], runner: AdbRunner, signal: AbortSignal, beforeDispatch?: () => void, components: ComponentInput[] = []): Promise<{ result: AdbResult; commandId: string }> {
    const id = randomUUID();
    let commandId = '';
    const result = await this.dispatch(id, 'adb', issued => {
      commandId = issued;
      beforeDispatch?.();
      return runner(args, signal, host => this.observe(id, { kind: 'host-start', process: host }));
    }, true, [{ id, kind: 'adb-command', serial: this.serial, args }, ...components]);
    return { result, commandId };
  }
  async adbReads(commands: string[][], runner: AdbRunner, signal: AbortSignal): Promise<AdbResult[]> {
    const dispatcher = this.recovery ?? this.session;
    if (!dispatcher) throw new AdmissionError('DISPATCH_CLOSED', 'Android dispatch is closed');
    try {
      return await dispatcher.dispatchReads(commands.map(args => {
        const id = randomUUID();
        return { operation: { requestId: id, componentId: id, operation: 'adb', payload: {}, recordResult: true,
          components: [{ id, kind: 'adb-command' as const, serial: this.serial, args }] },
        read: async () => {
          signal.throwIfAborted();
          return runner(args, signal, process => this.observe(id, { kind: 'host-start', process }));
        } };
      }));
    } catch (error) { this.uncertain = true; throw error; }
  }
  async dispatch<T>(componentId: string, operation: string, effect: (commandId: string) => Promise<T>, recordResult = false, components?: ComponentInput[]): Promise<T> {
    const request = { requestId: randomUUID(), componentId, operation, payload: {}, recordResult, ...(components ? { components } : {}) };
    const dispatcher = this.recovery ?? this.session;
    if (!dispatcher) throw new AdmissionError('DISPATCH_CLOSED', 'Android dispatch is closed');
    if (recordResult) {
      try { return await dispatcher.dispatch(request, effect); }
      catch (error) { this.uncertain = true; throw error; }
    }
    const result = await dispatcher.dispatch(request, async commandId => {
      try { return { kind: 'value' as const, value: await effect(commandId) }; }
      catch (error) {
        if (error instanceof OutcomeUnknownError) { this.uncertain = true; throw error; }
        return { kind: 'error' as const, error };
      }
    });
    if (result.kind === 'error') throw result.error;
    return result.value;
  }
  beginCleanup(cancelled: boolean): void {
    if (!this.uncertain && !cancelled) return;
    this.close('inconclusive');
    const recovery = this.admission.claimRecovery(this.claim.identity, randomUUID());
    if (recovery.kind === 'refused') throw new AdmissionError('COVERAGE_INCOMPLETE', 'Cleanup claim refused');
    this.recovery = recovery.claim;
  }
  private close(outcome: 'completed' | 'refused' | 'inconclusive'): void {
    if (this.closed) return;
    const result = this.claim.closeDispatch({ outcome, disposition: outcome === 'inconclusive' ? 'quarantined' : 'available', payload: {}, evidenceRefs: [] });
    this.closed = true;
    if (result.authority !== 'committed') throw new AdmissionError('STATE_UNAVAILABLE', 'Android closure unconfirmed');
  }
  finish(outcome: 'completed' | 'refused' = 'completed'): void {
    const view = this.view();
    const components: FenceRequest['components'] = [];
    for (const component of view.components) {
      const explicit = this.proofs.get(component.id);
      if (explicit) { components.push({ componentId: component.id, proof: explicit }); continue; }
      const settled = view.commands.find(command => command.componentId === component.id && command.state === 'settled');
      if (settled && (component.kind === 'one-shot' || component.kind === 'adb-command')) components.push({ componentId: component.id, proof: { kind: 'completed-command', commandId: settled.id } });
    }
    if (components.length !== view.components.length || view.commands.some(command => command.state !== 'settled')) this.uncertain = true;
    this.close(this.uncertain ? 'inconclusive' : outcome);
    const receipt: FenceRequest = { requestId: 'android-release', kind: 'stop', components,
      commands: view.commands.filter(command => command.state !== 'settled').map(command => command.id) };
    if (this.recovery) this.recovery.submitFence(receipt);
    else this.admission.submitFence(this.claim.identity, receipt);
    this.session = undefined;
  }
  retain(): void {
    this.uncertain = true;
    this.close('inconclusive');
    this.recovery?.close();
  }
  static declaration(component: { declaration: unknown }): ComponentInput { return componentSchema.parse(component.declaration); }
  start(id: string): ComponentObservation | undefined {
    for (const item of this.view().componentObservations) {
      if (item.componentId !== id) continue;
      const parsed = componentObservationSchema.safeParse(item.payload);
      if (parsed.success) return parsed.data;
    }
    return undefined;
  }
}
