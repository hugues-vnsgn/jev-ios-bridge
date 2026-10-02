// A fake Jev for driven-mode tests: no network, no key. Each call takes the next scripted answer, in order.
import { DRIVEN_JEV_MODEL, type DrivenDecision, type DrivenJudge, type PreparedDecision } from '../../src/driven/decide.js';
import { lookupCandidate } from '../../src/driven/candidates.js';
import { ScriptedJevError } from '../../src/scripted/jev.js';

/** A short answer: the choice, its confidence and the done Noul; the rest is filled in. */
export interface FakeAnswer { choice: string; confidence: number; done?: number; probabilities?: Record<string, number> }
export type FakeStep = FakeAnswer | Error | ((prepared: PreparedDecision) => FakeAnswer | Error);

export interface FakeDrivenJudge extends DrivenJudge {
  /** Every prepared decision the fake was asked, in order. */
  readonly asked: PreparedDecision[];
}

export function fakeDrivenJudge(steps: FakeStep[]): FakeDrivenJudge {
  const asked: PreparedDecision[] = [];
  return {
    asked,
    async decide(prepared, signal) {
      if (signal.aborted) throw new ScriptedJevError('ABORTED');
      asked.push(prepared);
      const step = steps.shift();
      if (step === undefined) throw new Error(`fake judge: no answer scripted for decision ${asked.length}`);
      const answer = typeof step === 'function' ? step(prepared) : step;
      if (answer instanceof Error) throw answer;
      if (!lookupCandidate(prepared.set, answer.choice)) throw new Error(`fake judge: ${answer.choice} was not offered`);
      const decision: DrivenDecision = {
        choice: answer.choice, confidence: answer.confidence, done: answer.done ?? 0,
        probabilities: answer.probabilities ?? { [answer.choice]: answer.confidence },
        inputTokens: 1, latencyMs: 1, model: DRIVEN_JEV_MODEL, options: prepared.set.candidates.length,
      };
      return decision;
    },
  };
}
