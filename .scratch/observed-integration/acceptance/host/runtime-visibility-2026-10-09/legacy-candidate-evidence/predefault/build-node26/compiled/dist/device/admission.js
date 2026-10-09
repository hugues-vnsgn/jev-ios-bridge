import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { AdmissionError, AdmissionSqlite } from './admission-sqlite.js';
const incarnation = randomUUID();
export { AdmissionError } from './admission-sqlite.js';
export function admissionRoot() { return join(userInfo().homedir, 'Library/Application Support/jev-ios-bridge/admission'); }
export function canonicalDevice(input) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input))
        throw new AdmissionError('INVALID_REQUEST', 'Expected a simulator UUID');
    return input.toUpperCase();
}
export function validateAttempt(identity) {
    if (!['observed', 'legacy', 'preparation'].includes(identity.kind) || !identity.id.trim() || identity.id.length > 500)
        throw new AdmissionError('INVALID_REQUEST', 'Invalid attempt identity');
}
/** Authority is private to this module; test stores must never reach a real backend. */
export class Admission {
    dependencies;
    mode;
    store;
    constructor(options, dependencies) {
        this.dependencies = dependencies;
        this.mode = options.mode;
        this.store = new AdmissionSqlite(options);
    }
    static open() {
        return new Admission({ root: admissionRoot(), mode: 'production' }, {});
    }
    static forTesting(options) {
        if (options.backend !== 'fake')
            throw new AdmissionError('INVALID_REQUEST', 'Test admission requires a fake backend');
        if (options.initialize !== false)
            AdmissionSqlite.initializeTestStore(options.root);
        return new Admission({ ...options, mode: 'test' }, options);
    }
    assertBackend(backend) {
        if (backend === 'real' && this.mode !== 'production')
            throw new AdmissionError('STATE_UNAVAILABLE', 'A real backend cannot use a test store');
    }
    activation() { return this.store.activation(); }
    readImportedAction(actionId) {
        if (!actionId.length || actionId.length > 1024)
            throw new AdmissionError('INVALID_REQUEST', 'Invalid historical action identity');
        return this.store.readImportedAction(actionId);
    }
    readImportedAllocation(allocationId) { return this.store.readImportedAllocation(canonicalDevice(allocationId)); }
    acquire(request) {
        validateAttempt(request.attempt);
        const device = canonicalDevice(request.device);
        if (!request.digest.trim())
            throw new AdmissionError('INVALID_REQUEST', 'Missing request digest');
        if (request.signal?.aborted)
            return { kind: 'refused', reason: 'CANCELLED' };
        const acquired = this.store.acquire({ ...request, device }, this.dependencies.process ?? { pid: process.pid, incarnation });
        if (acquired.kind !== 'acquired')
            return acquired;
        const claim = new OwnedClaim(this.store, acquired.owner);
        if (request.signal) {
            const cancel = () => { try {
                claim.cancel();
            }
            catch { /* Closed locally even if durable storage is unavailable. */ } };
            request.signal.addEventListener('abort', cancel, { once: true });
            claim.onClose(() => request.signal.removeEventListener('abort', cancel));
            if (request.signal.aborted)
                cancel();
        }
        return { kind: 'acquired', claim };
    }
    reserveAllocation(input) {
        const result = this.store.reserveAllocation(input, this.dependencies.process ?? { pid: process.pid, incarnation });
        if (result.kind !== 'reserved')
            return result;
        return { kind: 'reserved', reservation: new OwnedReservation(this.store, result.allocation) };
    }
    readAllocation(id) { return this.store.readAllocation(canonicalDevice(id)); }
    readAllocationForAction(actionId) { return this.store.readAllocationForAction(actionId); }
    consumeAllocation(binding) {
        const result = this.store.consumeAllocation({ ...binding, allocationId: canonicalDevice(binding.allocationId) }, this.dependencies.process ?? { pid: process.pid, incarnation });
        if (result.kind !== 'consumed')
            return result;
        return { kind: 'consumed', claim: new OwnedClaim(this.store, result.owner), allocation: result.allocation };
    }
    readAllocationCapacity() { return this.store.readAllocationCapacity(); }
    listActiveAllocations() { return this.store.listActiveAllocations(); }
    readAction(actionId) { return this.store.readAction(actionId); }
    recordActionExport(actionId, result) { return this.store.recordActionExport(actionId, result); }
    cancelAllocation(id) { return this.store.changeAllocation(canonicalDevice(id), 'cancel'); }
    retireAllocation(id) { return this.store.changeAllocation(canonicalDevice(id), 'retire'); }
    quarantineAbandonedAllocation(expected) {
        const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
        return liveness === 'dead' ? this.store.quarantineAbandonedAllocation(expected) : false;
    }
    inspect(device) { return this.store.inspect(canonicalDevice(device)); }
    readAttempt(identity) { validateAttempt(identity); return this.store.readAttempt(identity); }
    cancel(identity) { validateAttempt(identity); return this.store.cancel(identity); }
    quarantineAbandoned(expected, reason) {
        const liveness = this.dependencies.ownerLiveness?.(expected.process) ?? processLiveness(expected.process);
        if (liveness !== 'dead')
            return false;
        return this.store.quarantineAbandoned(expected, reason);
    }
}
function processLiveness(owner) {
    try {
        process.kill(owner.pid, 0);
        return 'alive';
    }
    catch (error) {
        return error.code === 'ESRCH' ? 'dead' : 'unknown';
    }
}
class OwnedClaim {
    store;
    parentClosed;
    closed = false;
    cancellationRequested = false;
    attached = false;
    closers = [];
    identity;
    constructor(store, identity, parentClosed = () => false) {
        this.store = store;
        this.parentClosed = parentClosed;
        this.identity = Object.freeze({ ...identity, attempt: Object.freeze({ ...identity.attempt }), process: Object.freeze({ ...identity.process }) });
    }
    onClose(callback) { this.closers.push(callback); }
    close() { this.closed = true; for (const callback of this.closers.splice(0))
        callback(); }
    bindDriver(backend = 'real') {
        if (this.closed || this.parentClosed() || this.attached)
            throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed or already attached');
        this.store.attach(this.identity, backend);
        this.attached = true;
        return new OwnedSession(this.store, this.identity, () => this.closed || this.parentClosed());
    }
    park(readinessEvidence, evidenceRefs = []) {
        if (this.closed || this.cancellationRequested || this.parentClosed())
            throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
        this.close();
        try {
            return { authority: 'committed', allocation: this.store.parkAllocation(this.identity, readinessEvidence, evidenceRefs) };
        }
        catch (error) {
            if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE')
                return { authority: 'unconfirmed', reason: 'STATE_UNAVAILABLE' };
            throw error;
        }
    }
    recordObservation(refs) {
        if (this.closed || this.parentClosed())
            throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
        try {
            return this.store.recordObservation(this.identity, refs);
        }
        catch (error) {
            this.close();
            throw error;
        }
    }
    recordActionReceipt(flags) {
        if (this.closed || this.parentClosed())
            throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
        try {
            return this.store.recordActionReceipt(this.identity, flags);
        }
        catch (error) {
            this.close();
            throw error;
        }
    }
    beginFinalization() { this.close(); return this.store.beginActionFinalization(this.identity); }
    cancel() {
        // Cancellation remains authoritative for this handle even if its write fails.
        this.cancellationRequested = true;
        this.close();
        return this.store.cancel(this.identity.attempt, this.identity);
    }
    finalize(candidate) {
        this.close();
        try {
            return { authority: 'committed', attempt: this.store.finalize(this.identity, candidate, this.cancellationRequested) };
        }
        catch (error) {
            if (error instanceof AdmissionError && error.code !== 'STATE_UNAVAILABLE')
                throw error;
            // Even a verified lost COMMIT reply is retrieval, never candidate publication.
            try {
                this.store.readAttempt(this.identity.attempt);
            }
            catch { /* Closed until authoritative resolution is possible. */ }
            return { authority: 'unconfirmed', reason: 'FINALIZATION_UNCONFIRMED' };
        }
    }
}
class OwnedSession {
    store;
    owner;
    closed;
    revoked = false;
    constructor(store, owner, closed) {
        this.store = store;
        this.owner = owner;
        this.closed = closed;
    }
    dispatch(kind, effect) {
        if (this.revoked || this.closed())
            throw new AdmissionError('DISPATCH_CLOSED', 'Claim is closed');
        let command;
        try {
            command = this.store.authorize(this.owner, kind);
        }
        catch (error) {
            this.revoked = true;
            throw error;
        }
        // No await between durable authorization and calling the backend. Cancellation
        // in another process can follow this authorization; it cannot retract it.
        let underlying;
        try {
            underlying = effect();
        }
        catch (error) {
            this.revoked = true;
            this.store.settle(this.owner, command, false);
            throw error;
        }
        return Promise.resolve(underlying).then(value => {
            try {
                this.store.settle(this.owner, command, true);
                return value;
            }
            catch (error) {
                this.revoked = true;
                throw error;
            }
        }, error => { this.revoked = true; this.store.settle(this.owner, command, false); throw error; });
    }
}
class OwnedReservation {
    store;
    identity;
    snapshot;
    closed = false;
    constructor(store, snapshot) {
        this.store = store;
        this.snapshot = structuredClone(snapshot);
        this.identity = Object.freeze({ ...snapshot.owner, process: Object.freeze({ ...snapshot.owner.process }) });
    }
    stage(artifact) {
        if (this.closed)
            throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
        return this.store.stageAllocation(this.identity, artifact);
    }
    async create(effect) {
        if (this.closed)
            throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
        try {
            this.store.startCreation(this.identity);
            let receipt;
            try {
                receipt = await effect();
            }
            catch {
                receipt = { status: 'unknown', reason: 'CREATE_UNCONFIRMED' };
            }
            return this.store.recordCreation(this.identity, receipt);
        }
        catch (error) {
            if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE')
                this.closed = true;
            throw error;
        }
    }
    admit() {
        if (this.closed)
            throw new AdmissionError('DISPATCH_CLOSED', 'Reservation is closed');
        const result = this.store.admitAllocation(this.identity);
        if (result.kind !== 'admitted')
            return result;
        return { kind: 'admitted', claim: new OwnedClaim(this.store, result.owner, () => this.closed) };
    }
    fail(reason, evidenceRefs = []) {
        this.closed = true;
        try {
            return { authority: 'committed', allocation: this.store.failAllocation(this.identity, reason, evidenceRefs) };
        }
        catch (error) {
            if (!(error instanceof AdmissionError) || error.code === 'STATE_UNAVAILABLE')
                return { authority: 'unconfirmed', reason: 'STATE_UNAVAILABLE' };
            throw error;
        }
    }
}
