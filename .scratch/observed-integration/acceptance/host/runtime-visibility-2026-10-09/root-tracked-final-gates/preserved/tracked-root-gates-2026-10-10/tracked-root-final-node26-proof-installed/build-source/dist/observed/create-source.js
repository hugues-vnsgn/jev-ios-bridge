export const sourceClock = { setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: handle => clearTimeout(handle) };
const unknown = { status: 'unknown', reason: 'CREATE_UNCONFIRMED' };
export const simulatorUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validSimulatorIdentifiers(deviceTypeId, runtimeId) {
    return typeof deviceTypeId === 'string' && typeof runtimeId === 'string' && runtimeId.length <= 500 && /^com\.apple\.CoreSimulator\.SimDeviceType\.[A-Za-z0-9.-]{1,200}$/.test(deviceTypeId)
        && /^com\.apple\.CoreSimulator\.SimRuntime\.iOS-\d+(?:-\d+){1,2}$/.test(runtimeId);
}
/** One attempt only; any ambiguity after starting is unknown, including nonzero exit. */
export async function createSimulator(request, dependencies) {
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(request.allocationId)
        || !validSimulatorIdentifiers(request.deviceTypeId, request.runtimeId)
        || !Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 900000) {
        return { status: 'not-dispatched', reason: 'INVALID_REQUEST' };
    }
    if (dependencies.signal?.aborted)
        return { status: 'not-dispatched', reason: 'CANCELLED' };
    const controller = new AbortController();
    let started = false;
    let closed = false;
    let actual;
    let finishDeadline;
    const deadline = new Promise(resolve => { finishDeadline = resolve; });
    const cancel = () => {
        closed = true;
        controller.abort();
        finishDeadline(started ? unknown : { status: 'not-dispatched', reason: 'CANCELLED' });
    };
    const clock = dependencies.clock ?? sourceClock;
    const timer = clock.setTimeout(cancel, request.timeoutMs);
    dependencies.signal?.addEventListener('abort', cancel, { once: true });
    const name = `jev-observed-${request.allocationId}`;
    try {
        const dispatch = dependencies.dispatch(async () => {
            if (closed || started || controller.signal.aborted)
                throw new Error('Creation dispatch is closed');
            started = true;
            try {
                const receipt = await dependencies.process('/usr/bin/xcrun', ['simctl', 'create', name, request.deviceTypeId, request.runtimeId], { signal: controller.signal, timeoutMs: request.timeoutMs, maxOutputBytes: 65536, shell: false });
                dependencies.diagnostics?.(receipt);
                const uuid = receipt.stdout.trim();
                actual = !closed && !controller.signal.aborted && receipt.exitCode === 0 && Buffer.byteLength(receipt.stdout) <= 65536
                    && Buffer.byteLength(receipt.stderr) <= 65536 && simulatorUuid.test(uuid)
                    ? { status: 'created', udid: uuid.toUpperCase(), provenance: { kind: 'simctl-create', allocationId: request.allocationId, name, deviceTypeId: request.deviceTypeId, runtimeId: request.runtimeId } }
                    : unknown;
            }
            catch (error) {
                try {
                    dependencies.diagnostics?.(error);
                }
                catch { /* Diagnostic failure cannot authorize work. */ }
                actual = unknown;
            }
            return actual;
        }).then(() => started ? actual ?? unknown : { status: 'not-dispatched', reason: 'ADMISSION_REFUSED' }, () => started ? unknown : { status: 'not-dispatched', reason: 'ADMISSION_REFUSED' });
        return await Promise.race([dispatch, deadline]);
    }
    catch {
        return started ? unknown : { status: 'not-dispatched', reason: 'ADMISSION_REFUSED' };
    }
    finally {
        closed = true;
        clock.clearTimeout(timer);
        dependencies.signal?.removeEventListener('abort', cancel);
    }
}
