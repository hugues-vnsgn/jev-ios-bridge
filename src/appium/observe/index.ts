import type { Snapshot } from '../../contracts/index.js';
import { createScreenshotEncoder, type ScreenshotImage } from '../../device/image.js';
import { settleCaptures, SettleDeadlineError, type Clock } from '../../device/settle.js';
import type { AppiumCommandSession } from '../session.js';
import type { VerifiedStack } from '../stack.js';
import { AppiumError, type AppiumSessionId } from '../wire-schemas.js';
import { normalizeSource, ObservationIncompleteError } from './normalize.js';
import { ObservationReferences } from './references.js';
export { ObservationReferences } from './references.js';

const wallClock: Clock = { now: () => performance.now(), sleep: ms => new Promise(done => setTimeout(done, ms)),
  timeout: ms => AbortSignal.timeout(Math.ceil(ms)) };
export interface AppiumObservedScreen { snapshot: Snapshot; screenshot: ScreenshotImage }
export class AppiumObservation {
  private readonly references: ObservationReferences;
  private readonly encode: ReturnType<typeof createScreenshotEncoder>;
  private readonly clock: Clock;
  constructor(private readonly session: AppiumCommandSession, stack: VerifiedStack,
    private readonly options: { clock?: Clock; sourceTimeoutMs?: number } = {}) {
    this.references = new ObservationReferences(session.sessionId, session.profile.device);
    this.encode = createScreenshotEncoder(stack);
    this.clock = options.clock ?? wallClock;
  }
  resolve(input: { sessionId: AppiumSessionId; snapshot: Snapshot; ref: string }) {
    return this.references.resolve(input);
  }
  /** True only for this session's latest snapshot while its dispatch is still open. */
  isCurrent(snapshot: Snapshot): boolean { return this.session.client.dispatchOpen && this.references.isCurrent(snapshot); }
  invalidate(): void { this.references.invalidate(); }
  async observe(signal: AbortSignal): Promise<AppiumObservedScreen> {
    this.invalidate();
    try {
      await this.session.client.awaitPendingObservation();
      const result = await settleCaptures(() => this.session.client.capturePair(async ({ xml, screen }) => {
        const capture = normalizeSource(this.session.profile.platform, xml);
        const screenshot = await this.encode(screen);
        return { capture, screenshot, capturedAt: Date.now() };
      }, this.options.sourceTimeoutMs), pair => pair.capture.screenHash, this.clock, signal, { returnDeadline: true });
      return { snapshot: this.references.issue(result.tree.capture, result.tree.capturedAt, result.settled), screenshot: result.tree.screenshot };
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof ObservationIncompleteError) throw error;
      if (error instanceof SettleDeadlineError || (error instanceof AppiumError && error.code === 'TIMEOUT')) throw new ObservationIncompleteError('timeout');
      throw new ObservationIncompleteError('driver-error');
    }
  }
}
