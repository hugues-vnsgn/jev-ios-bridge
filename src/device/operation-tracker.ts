export class OperationTracker {
  private readonly operations = new Set<Promise<unknown>>();
  private late: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();

  track<T>(operation: () => Promise<T>): Promise<T> {
    const pending = Promise.resolve().then(operation);
    this.operations.add(pending);
    const settled = () => { this.operations.delete(pending); };
    void pending.then(settled, settled);
    return pending;
  }

  async settle(signal: AbortSignal): Promise<void> {
    while (this.operations.size) {
      signal.throwIfAborted();
      const settled = Promise.allSettled([...this.operations]);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
        signal.addEventListener('abort', abort, { once: true });
        void settled.then(() => { signal.removeEventListener('abort', abort); resolve(); });
        if (signal.aborted) abort();
      });
    }
  }

  enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = this.writes.then(write);
    this.writes = result.then(() => {}, () => {});
    return result;
  }

  releaseLate(finish: () => Promise<void>): void {
    if (!this.operations.size || this.late) return;
    this.late = Promise.allSettled([...this.operations]).then(finish).catch(() => {}).finally(() => { this.late = undefined; });
  }
}
