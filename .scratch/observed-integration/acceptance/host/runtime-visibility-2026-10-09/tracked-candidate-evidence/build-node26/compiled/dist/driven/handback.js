// The hand-back gate: where a `do` step waits for Claude (E3–E5).
//
// The step loop (step.ts) calls `gate.handback(packet, signal)` when a decision goes to Claude. The gate holds that
// one pause (its pauseId, the package Claude reads, when it opened) until `resolve` gets a valid answer, the pause
// times out (`HANDBACK_TIMEOUT`), or the run is cancelled. The run keeps the device while it waits: nothing here
// touches the driver. An invalid answer is refused with a message Claude can act on, and the pause stays open.
//
// Answers are checked against the paused screen: refs must name an element of the paused snapshot that supports
// the action, value keys must be the step's own, a `revise` must read as a script, and a `tapAt` must fall inside
// the paused screenshot, on a platform whose driver can tap a point.
import { isAbsolute, join } from 'node:path';
import { z } from 'zod/v4';
import { imageSize } from '../device/image.js';
import { parseScriptedScenario } from '../scripted/schema.js';
import { describeElement } from './candidates.js';
import { maskElement, maskValues } from './decide.js';
import { DONE_YES } from './policy.js';
import { HANDBACK_ANSWER_KINDS, PAUSE_REASON_TEXT } from './vocabulary.js';
export { HANDBACK_ANSWER_KINDS, PAUSE_REASON_TEXT };
/** E5: how long a pause waits for Claude by default, and the range a run may choose. */
export const DEFAULT_HANDBACK_TIMEOUT_MS = 5 * 60_000;
export const MIN_HANDBACK_TIMEOUT_MS = 1_000;
export const MAX_HANDBACK_TIMEOUT_MS = 30 * 60_000;
/** Platforms whose driver can tap a point. iOS can't yet: MobileBuildMCP 2.7.1 has no point tap and ADR-0002
 *  rules out driving AXe directly, pending the owner's decision. */
export const TAP_AT_PLATFORMS = new Set(['android']);
/** No answer came within the pause's time: the run ends INCONCLUSIVE and releases the device. */
export class HandbackTimeoutError extends Error {
    code = 'HANDBACK_TIMEOUT';
    constructor() {
        super('HANDBACK_TIMEOUT');
        this.name = 'HandbackTimeoutError';
    }
}
/** An answer the gate refused, or no open pause to answer. The message is safe to show Claude; the pause stays. */
export class HandbackAnswerError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HandbackAnswerError';
    }
}
const ref = z.string().min(1).max(200);
/** Claude's answer, as `resolve_step` publishes it: exactly one kind. */
export const handbackAnswerSchema = z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('tap'), ref }),
    z.strictObject({ kind: z.literal('tapAt'), x: z.number().int().min(0), y: z.number().int().min(0) }),
    z.strictObject({ kind: z.literal('type'), ref, valueKey: z.string().min(1).max(200) }),
    z.strictObject({ kind: z.literal('scroll'), direction: z.enum(['up', 'down']) }),
    z.strictObject({ kind: z.literal('back') }),
    z.strictObject({ kind: z.literal('done') }),
    z.strictObject({ kind: z.literal('revise'), steps: z.array(z.record(z.string(), z.unknown())).min(1).max(100) }),
    z.strictObject({ kind: z.literal('stop') }),
]);
function actionable(element) {
    return element.state?.visible !== false && element.actions.length > 0;
}
export function createHandbackGate(options) {
    const { scenario } = options;
    const platform = scenario.platform ?? 'ios';
    const timeoutMs = options.timeoutMs ?? DEFAULT_HANDBACK_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < MIN_HANDBACK_TIMEOUT_MS || timeoutMs > MAX_HANDBACK_TIMEOUT_MS) {
        throw new RangeError('Invalid hand-back timeout');
    }
    const now = options.now ?? Date.now;
    const answers = HANDBACK_ANSWER_KINDS.filter(kind => kind !== 'tapAt' || TAP_AT_PLATFORMS.has(platform));
    let open;
    let listeners = new Set();
    const wake = () => { const woken = listeners; listeners = new Set(); for (const listener of woken)
        listener(); };
    const handback = async (packet, signal) => {
        if (open)
            throw new Error('A hand-back pause is already open');
        const screenshotPath = packet.screenshotPath && options.evidenceDir && !isAbsolute(packet.screenshotPath)
            ? join(options.evidenceDir, packet.screenshotPath) : packet.screenshotPath;
        const screenshotSize = screenshotPath ? await imageSize(screenshotPath) : undefined;
        if (signal.aborted)
            throw signal.reason;
        const pausedAt = now();
        const expiresAt = pausedAt + timeoutMs;
        // Every string Claude reads is masked like Jev's state (E14): the package is shown through get_report and the CLI.
        const mask = (text) => maskValues(text, scenario.values);
        const view = { pauseId: packet.pauseId, reason: packet.reason,
            reasonText: mask(PAUSE_REASON_TEXT[packet.reason] ?? packet.reason), stepId: mask(packet.stepId),
            intent: mask(packet.intent), doneWhen: mask(packet.doneWhen), screen: mask(packet.screen),
            ...(screenshotPath ? { screenshotPath } : {}),
            ...(screenshotSize ? { screenshotSize } : {}),
            topChoices: packet.topChoices.map(({ key, probability }) => ({ key: mask(key), probability })),
            ...(packet.jevDecision ? { jevDecision: { ...packet.jevDecision, choice: mask(packet.jevDecision.choice) } } : {}),
            ...(packet.confidenceFloor === undefined ? {} : { confidenceFloor: packet.confidenceFloor }),
            doneFloor: DONE_YES,
            valueKeys: packet.valueKeys,
            elements: packet.snapshot.elements.filter(actionable).map(element => ({ ref: element.ref,
                description: describeElement(maskElement(element, scenario.values)), actions: [...element.actions] })),
            answers, pausedAt: new Date(pausedAt).toISOString(), expiresAt: new Date(expiresAt).toISOString() };
        return new Promise((resolve, reject) => {
            const settle = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
                open = undefined;
            };
            const abort = () => { settle(); reject(signal.reason); };
            const expire = () => { settle(); reject(new HandbackTimeoutError()); };
            const timer = setTimeout(expire, timeoutMs);
            signal.addEventListener('abort', abort, { once: true });
            open = { packet, view, expiresAt, expire, deliver: answer => { settle(); resolve(answer); } };
            wake();
        });
    };
    /** The open pause, once any pause past its deadline has ended as the timeout: a late timer never extends it. */
    const current = () => {
        if (open && now() >= open.expiresAt)
            open.expire();
        return open;
    };
    const check = ({ packet, view }, parsed) => {
        const element = (wanted, action) => {
            const found = packet.snapshot.elements.find(candidate => candidate.ref === wanted);
            if (!found)
                throw new HandbackAnswerError(`Element ref "${wanted}" is not on the paused screen; use a ref from the package's elements`);
            if (!found.actions.includes(action)) {
                throw new HandbackAnswerError(`Element "${wanted}" does not support ${action} (it supports: ${found.actions.join(', ') || 'nothing'})`);
            }
        };
        switch (parsed.kind) {
            case 'tap':
                element(parsed.ref, 'tap');
                return parsed;
            case 'type':
                element(parsed.ref, 'typeText');
                if (!packet.valueKeys.includes(parsed.valueKey)) {
                    throw new HandbackAnswerError(packet.valueKeys.length
                        ? `Step ${view.stepId} may type only these value keys: ${packet.valueKeys.join(', ')}; "${parsed.valueKey}" is not one`
                        : `Step ${view.stepId} lists no values, so it may not type; revise the step to add a "values" key`);
                }
                return parsed;
            case 'tapAt': {
                if (!TAP_AT_PLATFORMS.has(platform)) {
                    throw new HandbackAnswerError(`UNSUPPORTED_ACTION: tapAt isn't available on ${platform} in this build ` +
                        `(MobileBuildMCP 2.7.1 has no tap at a point); answer with one of: ${answers.join(', ')}`);
                }
                const size = view.screenshotSize;
                if (!size)
                    throw new HandbackAnswerError('tapAt needs the paused screenshot, whose size is unknown; answer with another kind');
                if (parsed.x >= size.width || parsed.y >= size.height) {
                    throw new HandbackAnswerError(`tapAt (${parsed.x}, ${parsed.y}) is outside the ${size.width} × ${size.height} ` +
                        `screenshot; x must be 0 to ${size.width - 1} and y 0 to ${size.height - 1}`);
                }
                return parsed;
            }
            case 'revise': {
                const steps = parsed.steps;
                const version2 = steps.some(step => step.kind === 'do') || scenario.goal !== undefined || scenario.start !== undefined;
                let revised;
                try {
                    revised = parseScriptedScenario({ ...scenario, version: version2 ? 2 : 1, steps }).steps;
                }
                catch (error) {
                    const detail = error instanceof z.ZodError ? z.prettifyError(error) : 'it could not be read';
                    throw new HandbackAnswerError(`The revision is not valid as the script's steps:\n${detail}`);
                }
                return { kind: 'revise', steps: revised };
            }
            default:
                return parsed;
        }
    };
    return {
        handback,
        pending: () => current()?.view,
        onPause(listener) {
            if (open) {
                listener();
                return () => { };
            }
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        resolve(pauseId, raw) {
            // An answer at or after the deadline is the timeout, whenever the timer itself runs.
            if (open && !current())
                throw new HandbackAnswerError('The pause expired before this answer came; the run ends HANDBACK_TIMEOUT');
            if (!open)
                throw new HandbackAnswerError('The run is not waiting for an answer');
            if (pauseId !== open.packet.pauseId) {
                throw new HandbackAnswerError(`Pause ${pauseId} is not the open pause; the open pause is ${open.packet.pauseId}`);
            }
            const parsed = handbackAnswerSchema.safeParse(raw);
            if (!parsed.success)
                throw new HandbackAnswerError(`The answer is not valid:\n${z.prettifyError(parsed.error)}`);
            const answer = check(open, parsed.data);
            open.deliver(answer);
            return answer;
        },
        close: wake,
    };
}
const NOT_ASKED = 'none (Jev was not asked about this screen)';
/** A number as the pause prints it: 3 decimals (at least 2, trailing zeros dropped), plus whatever digits keep it on
 *  the same side of `threshold` as the raw value, so a rejected 0.7999 never reads as a 0.80 that met its floor. */
function formatAgainst(value, threshold) {
    for (let digits = 3;; digits++) {
        const text = value.toFixed(digits).replace(/(\.\d\d\d*?)0+$/, '$1');
        if (threshold === undefined || digits >= 15 || (Number(text) >= threshold) === (value >= threshold))
            return text;
    }
}
/** Whether a number met its threshold, compared raw: the line under the number it judges. */
function verdictLine(value, threshold, missed) {
    return value >= threshold ? `  ${formatAgainst(value, threshold)} is at or above the ${threshold.toFixed(2)} floor`
        : `  ${formatAgainst(value, threshold)} is below the ${threshold.toFixed(2)} floor, so ${missed}`;
}
/** Jev's numbers, each labelled with what the bridge compares it with: an option's probability isn't the confidence.
 *  A number with a threshold is followed by whether it met it. */
function jevLines(pause) {
    const picks = pause.topChoices.map(choice => `${choice.key} (${formatAgainst(choice.probability)})`).join(', ');
    const decision = pause.jevDecision;
    if (!decision)
        return [`Jev's choice: ${NOT_ASKED}`, `Jev's top picks: ${picks || NOT_ASKED}`];
    const floor = pause.confidenceFloor ?? undefined;
    const floorText = pause.confidenceFloor === null ? 'the bridge never takes Jev\'s pick in this step'
        : floor === undefined ? undefined : `the bridge takes a pick at confidence ${floor.toFixed(2)} or more`;
    return [
        `Jev's choice: ${decision.choice}, confidence ${formatAgainst(decision.confidence, floor)}${floorText ? `; ${floorText}` : ''}`,
        ...(floor === undefined ? [] : [verdictLine(decision.confidence, floor, 'the bridge doesn\'t act on it')]),
        `Jev's step-done probability: ${formatAgainst(decision.done, pause.doneFloor)}; the step is done at ${pause.doneFloor.toFixed(2)} or more`,
        verdictLine(decision.done, pause.doneFloor, 'the step isn\'t done'),
        `Jev's top picks: ${picks || 'none'} (each option's probability, not Jev's confidence)`,
    ];
}
/** The pause as text for Claude: what happened, the screen, and how to answer. */
export function renderPause(runId, pause, at = Date.now()) {
    const secondsLeft = Math.max(0, Math.round((Date.parse(pause.expiresAt) - at) / 1000));
    return [
        'Status: needs_claude',
        `Run: ${runId}`,
        `Pause: ${pause.pauseId} (expires ${pause.expiresAt}, about ${secondsLeft} s left; the device stays held until then)`,
        `Reason: ${pause.reason}: ${pause.reasonText}`,
        `Step: ${pause.stepId}: ${pause.intent}`,
        `Done when: ${pause.doneWhen}`,
        `Screenshot: ${pause.screenshotPath ?? 'none'}${pause.screenshotSize ? ` (${pause.screenshotSize.width} × ${pause.screenshotSize.height} px)` : ''}`,
        ...jevLines(pause),
        `Value keys this step may type: ${pause.valueKeys.join(', ') || 'none'}`,
        'Elements (ref: description [actions]):',
        ...(pause.elements.length ? pause.elements.map(element => `  ${element.ref}: ${element.description} [${element.actions.join(', ')}]`) : ['  none']),
        'Screen text:',
        pause.screen || '(could not be rendered; read the screenshot)',
        `Answer with resolve_step { runId, pauseId, answer }, answer one of: ${pause.answers.join(', ')}.`,
    ].join('\n');
}
