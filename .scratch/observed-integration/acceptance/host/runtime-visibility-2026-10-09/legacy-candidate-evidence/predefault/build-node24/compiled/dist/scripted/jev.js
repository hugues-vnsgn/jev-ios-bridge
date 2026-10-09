import { APIConnectionError, APIError, APITimeoutError, APIUserAbortError, TypeSafeClient, noul, } from '@typesafe-ai/sdk';
export const SCRIPTED_JEV_MODEL = 'jev-1.13.0';
export const ASSERTION_QUESTION = 'Does the visible evidence on this current screen support this specific claim?';
export const STATE_QUESTION_MAX_BYTES = 28_000;
export const REQUEST_MAX_BYTES = 56_000;
export class ScriptedJevError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'ScriptedJevError';
    }
}
const record = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const probability = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export function assertionQuestionId(id) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))
        throw new ScriptedJevError('INVALID_INPUT');
    return `assertion:${encodeURIComponent(id)}`;
}
/** One positive Noul question per current claim, with no Choice or completion question. */
export function buildAssertionRequest(assertions, state) {
    if (!assertions.length || assertions.length > 20 || !state.trim())
        throw new ScriptedJevError('INVALID_INPUT');
    const questions = {};
    for (const assertion of assertions) {
        const id = assertionQuestionId(assertion.id);
        if (!assertion.claim.trim() || Object.hasOwn(questions, id))
            throw new ScriptedJevError('INVALID_INPUT');
        questions[id] = noul({ question: ASSERTION_QUESTION, claim: assertion.claim });
    }
    const request = { model: SCRIPTED_JEV_MODEL, state, questions };
    const stateBytes = Buffer.byteLength(JSON.stringify(state), 'utf8');
    const longestQuestion = Math.max(...Object.values(questions).map(question => Buffer.byteLength(JSON.stringify(question), 'utf8')));
    if (stateBytes + longestQuestion > STATE_QUESTION_MAX_BYTES ||
        Buffer.byteLength(JSON.stringify(request), 'utf8') > REQUEST_MAX_BYTES) {
        throw new ScriptedJevError('REQUEST_BUDGET');
    }
    return request;
}
/** Strictly parse untrusted model output without including its body in errors. */
export function parseAssertionResult(raw, assertions, latencyMs) {
    if (!record(raw) || raw.model !== SCRIPTED_JEV_MODEL || !record(raw.answers) || !record(raw.usage) ||
        !Number.isFinite(latencyMs) || latencyMs < 0)
        throw new ScriptedJevError('MALFORMED_RESPONSE');
    const ids = assertions.map(assertion => assertionQuestionId(assertion.id));
    if (Object.keys(raw.answers).length !== ids.length)
        throw new ScriptedJevError('MALFORMED_RESPONSE');
    const probabilities = {};
    for (const assertion of assertions) {
        const answer = raw.answers[assertionQuestionId(assertion.id)];
        if (!record(answer) || answer.type !== 'noul' || !probability(answer.noul)) {
            throw new ScriptedJevError('MALFORMED_RESPONSE');
        }
        probabilities[assertion.id] = answer.noul;
    }
    const inputTokens = raw.usage.input_tokens;
    const outputTokens = raw.usage.output_tokens;
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
        !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
        throw new ScriptedJevError('MALFORMED_RESPONSE');
    }
    return { probabilities, inputTokens: inputTokens, latencyMs, model: SCRIPTED_JEV_MODEL };
}
export function requestError(error) {
    if (error instanceof APIUserAbortError)
        return new ScriptedJevError('ABORTED');
    if (error instanceof APITimeoutError)
        return new ScriptedJevError('TIMEOUT');
    if (error instanceof APIConnectionError)
        return new ScriptedJevError('NETWORK');
    if (error instanceof APIError) {
        if (error.status === 401 || error.status === 403)
            return new ScriptedJevError('AUTH');
        if (error.status === 429)
            return new ScriptedJevError('RATE_LIMIT');
        return new ScriptedJevError('SERVICE');
    }
    return new ScriptedJevError('UNKNOWN');
}
export function createAssertionJudge(options = {}) {
    let client;
    if (options.client)
        client = options.client;
    else {
        if (!process.env.TYPESAFE_API_KEY?.trim())
            throw new ScriptedJevError('AUTH');
        try {
            client = new TypeSafeClient({ defaultModel: SCRIPTED_JEV_MODEL, logLevel: 'warn' });
        }
        catch (error) {
            throw requestError(error);
        }
    }
    return {
        async judge(assertions, observationText, signal) {
            const request = buildAssertionRequest(assertions, observationText);
            if (signal.aborted)
                throw new ScriptedJevError('ABORTED');
            const start = performance.now();
            let raw;
            try {
                raw = await client.systemOne(request, { signal });
            }
            catch (error) {
                throw requestError(error);
            }
            return parseAssertionResult(raw, assertions, performance.now() - start);
        },
    };
}
