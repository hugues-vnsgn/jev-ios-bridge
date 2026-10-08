import { BRIDGE_VERSION } from '../version.js';
import { isReasonCode } from './vocabulary.js';
/** Version of the frozen report.json shape (ADR-0005). 1.x may add fields; readers ignore unknown ones. */
export const REPORT_VERSION = 1;
const text = (value) => typeof value === 'string' ? value : null;
const count = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Keeps only the entries of an unknown value whose value is itself a string; `{}` for anything else. */
function stringRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[1] === 'string'));
}
/** One shown value per replace-text step, built from the run's `action` events; `[]` when none typed. */
export function typedFieldsOf(events) {
    return events.flatMap(event => event.type === 'action' && event.data.action === 'replaceText' &&
        typeof event.data.shownValue === 'string'
        ? [{ stepId: String(event.data.stepId ?? ''), shownValue: event.data.shownValue }] : []);
}
/** The run's own recorded platform (from `started`), the one place any reader decides Android vs iOS;
 *  a run with no `started` event, or no recorded `platform`, reads as iOS. */
export function recordedPlatform(events) {
    return events.find(event => event.type === 'started')?.data.platform === 'android' ? 'android' : 'ios';
}
/** The Android-only fields, built from `started` and the `action` events; `{}` on iOS runs. */
function androidReportFields(started, events) {
    if (recordedPlatform(events) !== 'android' || !started)
        return {};
    const typedFields = typedFieldsOf(events);
    return {
        platform: 'android',
        package: text(started.data.package) ?? '',
        activity: started.data.activity === null ? null : text(started.data.activity),
        intentExtras: stringRecord(started.data.intentExtras),
        ...(typedFields.length ? { typedFields } : {}),
    };
}
/** Whether the run's script has a `do` step: only such a run gets driven fields, so a v1 report stays as it was. */
export function isDrivenRun(events) {
    const planned = events.find(event => event.type === 'started')?.data.plannedSteps;
    return Array.isArray(planned) && planned.some(step => step?.kind === 'do');
}
const DECIDERS = new Set(['jev', 'claude']);
/** A logged action target, read back field by field; nothing when it isn't one. */
function actionTarget(value) {
    if (!value || typeof value !== 'object')
        return {};
    const { role, label, identifier } = value;
    if (typeof role !== 'string')
        return {};
    return { target: { role, ...(typeof label === 'string' ? { label } : {}),
            ...(typeof identifier === 'string' ? { identifier } : {}) } };
}
/** The step kinds by id: the planned steps, then each revision's, the later winning. */
function stepKindsOf(events) {
    const kinds = new Map();
    const add = (list) => {
        if (!Array.isArray(list))
            return;
        for (const step of list) {
            if (typeof step?.id === 'string')
                kinds.set(step.id, step.kind);
        }
    };
    for (const event of events) {
        if (event.type === 'started')
            add(event.data.plannedSteps);
        if (event.type === 'handback_answer' && event.data.kind === 'revise')
            add(event.data.steps);
    }
    return kinds;
}
/** The `do` steps that ran, by run step number, from their `step` events; each completed by the `decision` event
 *  whose done check said yes, or by Claude's `done` answer. A `do` step that started but failed before its first
 *  observation has no `step` event: the run's `error` names it, and the verdict's step count is its number. */
function doStepsOf(events) {
    const steps = new Map();
    const kinds = stepKindsOf(events);
    const failedStep = count(events.findLast(event => event.type === 'verdict')?.data.steps);
    for (const event of events) {
        if (event.type === 'error' && failedStep !== null && !steps.has(failedStep) &&
            typeof event.data.stepId === 'string' && kinds.get(event.data.stepId) === 'do') {
            steps.set(failedStep, { stepId: event.data.stepId, completedBy: null });
        }
        const number = event.data.step;
        if (typeof number !== 'number')
            continue;
        if (event.type === 'step' && event.data.kind === 'do' && !steps.has(number)) {
            steps.set(number, { stepId: String(event.data.stepId ?? ''), completedBy: null });
        }
        const step = steps.get(number);
        if (!step || step.completedBy !== null)
            continue;
        if (event.type === 'decision' && event.data.stepDone === true) {
            step.completedBy = 'jev';
            if (typeof event.data.done === 'number')
                step.done = event.data.done;
        }
        if (event.type === 'handback_answer' && event.data.kind === 'done')
            step.completedBy = 'claude';
    }
    return [...steps.values()];
}
/** The driven block, built from `started`, `preflight`, `step`, `decision`, `action`, `search`, `handback` and
 *  `handback_answer`. */
export function drivenReportOf(events) {
    if (!isDrivenRun(events))
        return undefined;
    const started = events.find(event => event.type === 'started')?.data;
    const preflight = events.find(event => event.type === 'preflight')?.data;
    const status = preflight?.status;
    const decisions = events.filter(event => event.type === 'decision');
    const actions = events.flatMap((event) => {
        const data = event.data;
        if (event.type === 'search') {
            return [{ stepId: String(data.stepId ?? ''), action: 'scroll',
                    ...(typeof data.direction === 'string' ? { direction: data.direction } : {}), decidedBy: 'bridge',
                    ...(typeof data.changed === 'boolean' ? { changed: data.changed } : {}) }];
        }
        if (event.type !== 'action')
            return [];
        const decidedBy = typeof data.decidedBy === 'string' && DECIDERS.has(data.decidedBy) ? data.decidedBy : 'script';
        return [{ stepId: String(data.stepId ?? ''), action: String(data.action ?? ''),
                ...(typeof data.resolvedRef === 'string' ? { ref: data.resolvedRef } : {}),
                ...actionTarget(data.target),
                ...(typeof data.valueKey === 'string' ? { valueKey: data.valueKey } : {}),
                ...(typeof data.direction === 'string' ? { direction: data.direction } : {}),
                ...(typeof data.x === 'number' && typeof data.y === 'number' ? { x: data.x, y: data.y } : {}),
                decidedBy,
                ...(decidedBy === 'jev' && typeof data.key === 'string' ? { key: data.key } : {}),
                ...(decidedBy === 'jev' && typeof data.confidence === 'number' ? { confidence: data.confidence } : {}),
                ...(data.retry === true ? { retry: true } : {}) }];
    });
    const handbacks = events.flatMap((event) => {
        if (event.type !== 'handback')
            return [];
        const pauseId = event.data.pauseId;
        const answer = typeof pauseId !== 'string' ? undefined : events.find(candidate => candidate.type === 'handback_answer' &&
            candidate.sequence > event.sequence && candidate.data.pauseId === pauseId);
        return [{ stepId: String(event.data.stepId ?? ''), reason: String(event.data.reason ?? ''),
                answer: typeof answer?.data.kind === 'string' ? answer.data.kind : null,
                waitMs: answer ? Math.max(0, Date.parse(answer.at) - Date.parse(event.at)) || 0 : null,
                event: event.sequence }];
    });
    return {
        start: started?.start === 'attach' ? 'attach' : 'restart',
        preflight: status === 'ok' || status === 'missing' || status === 'failed' ? {
            status, exitCode: count(preflight.exitCode),
            ...(typeof preflight.failure === 'string' ? { failure: preflight.failure } : {}),
            durationMs: count(preflight.durationMs) ?? 0
        } : null,
        decisions: decisions.length,
        decisionInputTokens: decisions.reduce((sum, event) => sum + (count(event.data.inputTokens) ?? 0), 0),
        actions,
        doSteps: doStepsOf(events),
        handbacks,
    };
}
/** Build the frozen report from recorded events. The recorded verdict is authoritative. */
export function buildReportJson(events) {
    if (!events.length)
        throw new Error('Scripted run log is empty');
    const started = events.find(event => event.type === 'started');
    const verdictEvent = events.findLast(event => event.type === 'verdict');
    const final = verdictEvent?.data;
    const recorded = final?.verdict;
    const verdict = recorded === 'passed' || recorded === 'failed' ? recorded : 'inconclusive';
    const reason = !verdictEvent ? 'INTERRUPTED' : isReasonCode(final?.reason) ? final.reason : 'INTERNAL_ERROR';
    const lastError = events.findLast(event => event.type === 'error');
    const checkpoints = events.filter(event => event.type === 'checkpoint').map(event => {
        const observed = events.findLast(candidate => candidate.type === 'step' && candidate.sequence < event.sequence &&
            candidate.data.stepId === event.data.stepId);
        const claims = Array.isArray(event.data.assertions) ? event.data.assertions.flatMap(item => {
            const claim = item;
            return typeof claim.id === 'string' && typeof claim.claim === 'string' && typeof claim.probability === 'number'
                ? [{ id: claim.id, claim: claim.claim, probability: claim.probability }] : [];
        }) : [];
        const status = event.data.status;
        return {
            stepId: String(event.data.stepId ?? ''),
            status: status === 'passed' || status === 'failed' ? status : 'inconclusive',
            claims,
            screenshot: text(observed?.data.screenshotPath),
            evidenceEvent: observed?.sequence ?? null,
        };
    });
    const judged = events.find(event => event.type === 'judgment' && typeof event.data.model === 'string');
    const planned = started?.data.plannedSteps;
    const steps = count(final?.steps) ?? Math.max(0, ...events
        .filter(event => event.type === 'step' && Number.isSafeInteger(event.data.step))
        .map(event => event.data.step));
    const driven = drivenReportOf(events);
    return {
        reportVersion: REPORT_VERSION,
        runId: events[0].runId,
        bridgeVersion: text(started?.data.bridgeVersion) ?? BRIDGE_VERSION,
        jevModel: text(started?.data.jevModel) ?? text(judged?.data.model),
        projectionRule: text(started?.data.projectionRule),
        bundleId: text(started?.data.bundleId),
        launchArgs: Array.isArray(started?.data.launchArgs)
            ? started.data.launchArgs.filter((argument) => typeof argument === 'string') : [],
        verdict,
        reason,
        error: lastError ? {
            code: isReasonCode(lastError.data.code) ? lastError.data.code : 'EXECUTION_ERROR',
            phase: text(lastError.data.phase),
            stepId: text(lastError.data.stepId),
            ...(typeof lastError.data.vendorCode === 'string' ? { vendorCode: lastError.data.vendorCode } : {}),
        } : null,
        steps,
        plannedSteps: Array.isArray(planned) ? planned.length : null,
        checkpointsPassed: count(final?.checkpointsPassed) ?? checkpoints.filter(checkpoint => checkpoint.status === 'passed').length,
        checkpointCount: count(final?.checkpointCount),
        inputTokens: count(final?.inputTokens) ?? 0,
        durationMs: count(final?.durationMs) ?? 0,
        startedAt: events[0].at,
        finishedAt: verdictEvent?.at ?? null,
        checkpoints,
        evidence: {
            log: 'run.jsonl',
            screenshots: events.flatMap(event => event.type === 'step' && typeof event.data.screenshotPath === 'string'
                ? [event.data.screenshotPath] : []),
        },
        ...androidReportFields(started, events),
        ...(driven ? { driven } : {}),
    };
}
