import {
  APIConnectionError, APIError, APITimeoutError, APIUserAbortError,
  TypeSafeClient, choice, noul,
  type Questions, type SystemOneRequest,
} from '@typesafe-ai/sdk';
import type { JevJudge, Judgment, Observation, Scenario } from '../contracts/index.js';

export const JEV_MODEL = 'jev-1.13.0';
export interface QuestionWording {
  nextAction: string;
  goalReached: string;
  assertion: string;
}
export const DEFAULT_WORDING: QuestionWording = {
  nextAction: 'Which complete listed action is the appropriate next step toward the scenario goal, given the observation and supplied history? Select none if no listed action fits.',
  goalReached: 'Does the current observation establish that the scenario goal has been reached?',
  assertion: 'Does the current observation establish this specific scenario claim?',
};
/** Revised phrasing for the separately approved v2 feasibility experiment. */
export const V2_WORDING: QuestionWording = {
  nextAction: 'Which complete listed action best advances the scenario goal now? Resolve a blocking setup or permission prompt before using controls behind it. Choose stop-goal only when the entire requested end state and its evidence are visibly established now; do not tap text merely to read evidence already visible. If progress is visibly blocked, choose stop-blocked; if no listed action fits and no blocker is established, choose none.',
  goalReached: 'Does this observation visibly establish the entire scenario goal now, including any named item or requested verification evidence? A general completion banner is insufficient when the goal asks to see a particular item. Do not require another tap merely to read evidence already visible.',
  assertion: DEFAULT_WORDING.assertion,
};

export class JevContractError extends Error {
  constructor(readonly code: 'INVALID_INPUT' | 'REQUEST_BUDGET' | 'MALFORMED_RESPONSE') {
    super(code);
    this.name = 'JevContractError';
  }
}
export class JevRequestError extends Error {
  constructor(readonly code: 'ABORTED' | 'TIMEOUT' | 'AUTH' | 'RATE_LIMIT' | 'SERVICE' | 'NETWORK' | 'UNKNOWN') {
    super(code);
    this.name = 'JevRequestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isProbability = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const malformed = (): never => { throw new JevContractError('MALFORMED_RESPONSE'); };

export function assertionQuestionId(id: string): string {
  if (!id.trim()) throw new JevContractError('INVALID_INPUT');
  return `assertion:${encodeURIComponent(id)}`;
}

/** One Choice binds an operation to every argument; companion Nouls are independent. */
export function buildJevRequest(
  scenario: Scenario,
  observation: Observation,
  wording: QuestionWording = DEFAULT_WORDING,
): SystemOneRequest<Questions> {
  if (!observation.options.length || observation.options.length > 255) throw new JevContractError('INVALID_INPUT');
  const criteria: Record<string, string> = {};
  for (const option of observation.options) {
    if (!option.id || Object.hasOwn(criteria, option.id)) throw new JevContractError('INVALID_INPUT');
    criteria[option.id] = option.description;
  }
  if (!Object.hasOwn(criteria, 'none')) throw new JevContractError('INVALID_INPUT');
  const questions: Questions = {
    next_action: choice(wording.nextAction, criteria),
    goal_reached: noul(wording.goalReached),
  };
  for (const assertion of scenario.assertions) {
    const questionId = assertionQuestionId(assertion.id);
    if (Object.hasOwn(questions, questionId)) throw new JevContractError('INVALID_INPUT');
    questions[questionId] = noul({ question: wording.assertion, claim: assertion.claim });
  }
  const request: SystemOneRequest<Questions> = { model: JEV_MODEL, state: observation.text, questions };
  const stateBytes = Buffer.byteLength(JSON.stringify(request.state), 'utf8');
  const questionBytes = Object.values(questions).map(question => Buffer.byteLength(JSON.stringify(question), 'utf8'));
  const longestQuestion = Math.max(...questionBytes);
  const totalBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  // Byte counts bound common text-token counts conservatively; both caps leave room for protocol overhead.
  if (stateBytes + longestQuestion > 28_000 || totalBytes > 56_000) throw new JevContractError('REQUEST_BUDGET');
  return request;
}

/** Validate untrusted SDK output without putting response bodies in thrown errors. */
export function parseJevResult(raw: unknown, scenario: Scenario, observation: Observation, latencyMs: number): Judgment {
  if (!isRecord(raw) || raw.model !== JEV_MODEL || !isRecord(raw.answers) || !isRecord(raw.usage)) {
    throw new JevContractError('MALFORMED_RESPONSE');
  }
  const answers = raw.answers;
  if (Object.keys(answers).length !== scenario.assertions.length + 2) malformed();
  const choiceAnswer = answers.next_action;
  if (!isRecord(choiceAnswer) || choiceAnswer.type !== 'choice' || typeof choiceAnswer.choice !== 'string' ||
      !isProbability(choiceAnswer.confidence) || !isRecord(choiceAnswer.probabilities)) throw new JevContractError('MALFORMED_RESPONSE');
  const optionIds = observation.options.map(option => option.id);
  if (!optionIds.includes(choiceAnswer.choice)) malformed();
  const probabilities: Record<string, number> = {};
  let sum = 0;
  if (Object.keys(choiceAnswer.probabilities).length !== optionIds.length) malformed();
  for (const id of optionIds) {
    const probability = choiceAnswer.probabilities[id];
    if (!isProbability(probability)) throw new JevContractError('MALFORMED_RESPONSE');
    probabilities[id] = probability;
    sum += probability;
  }
  if (Math.abs(sum - 1) > 0.02) malformed();
  const goal = answers.goal_reached;
  if (!isRecord(goal) || goal.type !== 'noul' || !isProbability(goal.noul)) throw new JevContractError('MALFORMED_RESPONSE');
  const assertions: Record<string, number> = {};
  for (const assertion of scenario.assertions) {
    const answer = answers[assertionQuestionId(assertion.id)];
    if (!isRecord(answer) || answer.type !== 'noul' || !isProbability(answer.noul)) throw new JevContractError('MALFORMED_RESPONSE');
    assertions[assertion.id] = answer.noul;
  }
  const inputTokens = raw.usage.input_tokens;
  const outputTokens = raw.usage.output_tokens;
  if (!Number.isSafeInteger(inputTokens) || (inputTokens as number) < 0 ||
      !Number.isSafeInteger(outputTokens) || (outputTokens as number) < 0 ||
      !Number.isFinite(latencyMs) || latencyMs < 0) malformed();
  return {
    choice: choiceAnswer.choice,
    confidence: choiceAnswer.confidence,
    probabilities,
    goalReached: goal.noul,
    assertions,
    inputTokens: inputTokens as number,
    latencyMs,
    model: raw.model,
  };
}

function safeRequestError(error: unknown): JevRequestError {
  if (error instanceof APIUserAbortError) return new JevRequestError('ABORTED');
  if (error instanceof APITimeoutError) return new JevRequestError('TIMEOUT');
  if (error instanceof APIConnectionError) return new JevRequestError('NETWORK');
  if (error instanceof APIError) {
    if (error.status === 401 || error.status === 403) return new JevRequestError('AUTH');
    if (error.status === 429) return new JevRequestError('RATE_LIMIT');
    return new JevRequestError('SERVICE');
  }
  return new JevRequestError('UNKNOWN');
}

export interface JevJudgeOptions {
  client?: Pick<TypeSafeClient, 'systemOne'>;
  wording?: QuestionWording;
}

export function createJevJudge(options: JevJudgeOptions = {}): JevJudge {
  return {
    async judge(scenario, observation, signal) {
      const request = buildJevRequest(scenario, observation, options.wording);
      if (signal.aborted) throw new JevRequestError('ABORTED');
      const start = performance.now();
      let raw: unknown;
      try {
        const client = options.client ?? new TypeSafeClient({ defaultModel: JEV_MODEL, logLevel: 'warn' });
        raw = await client.systemOne(request, { signal });
      } catch (error) {
        throw safeRequestError(error);
      }
      return parseJevResult(raw, scenario, observation, performance.now() - start);
    },
  };
}
