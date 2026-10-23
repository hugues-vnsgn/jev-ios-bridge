import type { Element, Snapshot } from '../../contracts/index.js';
import { StaleSnapshotError } from '../../device/index.js';
import type { AppiumSessionId } from '../wire-schemas.js';
import type { NormalizedCapture } from './normalize.js';

export class ObservationReferences {
  private sequence = 0;
  private current: Snapshot | undefined;
  private targets = new Map<string, Element>();
  constructor(private readonly sessionId: AppiumSessionId, private readonly deviceId: string) {}
  invalidate(): void { this.current = undefined; this.targets.clear(); }
  issue(capture: NormalizedCapture, capturedAt: number, settled: boolean): Snapshot {
    const snapshot: Snapshot = { deviceId: this.deviceId, capturedAt, expiresAt: capturedAt + 60_000,
      sequence: ++this.sequence, truncated: false, screenHash: capture.screenHash,
      elements: structuredClone(capture.elements), ...(settled ? {} : { settled: false }) };
    this.current = snapshot;
    this.targets = new Map(snapshot.elements.map(element => [element.ref, structuredClone(element)]));
    return snapshot;
  }
  resolve({ sessionId, snapshot, ref }: { sessionId: AppiumSessionId; snapshot: Snapshot; ref: string }): Element {
    const element = this.targets.get(ref);
    if (sessionId !== this.sessionId || snapshot !== this.current || !element) throw new StaleSnapshotError();
    return structuredClone(element);
  }
}
