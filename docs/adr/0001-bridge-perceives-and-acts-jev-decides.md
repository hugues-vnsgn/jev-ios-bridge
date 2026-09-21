# ADR-0001: The bridge perceives and acts; Jev only decides

Date: 2026-09-21
Status: accepted

## Context

The original brief assumed Jev (typesafe.ai) was a multimodal device-automation engine that would receive screen dimensions and instructions and run its own action loop. The live docs contradict this. Jev is a stateless, text-only judgment model exposed at one endpoint, `POST /v1/systemone`. It accepts strings and JSON as state, answers Choice, Noul, and Score questions with calibrated probabilities, and states that images, audio, and video are not supported. It has no sessions, no streaming, and no notion of actions.

Three options were considered:

1. Reframe: the bridge observes the simulator as text (accessibility tree), performs actions, and asks Jev per-step questions such as "which candidate element advances the scenario" and "does this observation satisfy the assertion".
2. Use Jev only for assertions and reports, and a vision-capable model for choosing steps.
3. Drop Jev and target a different device-agent product.

## Decision

Option 1, with option 2 as the documented fallback when the accessibility tree is too thin for Jev to choose from.

## Consequences

- Perception quality bounds the whole system. The accessibility tree must be pruned into a candidate list that fits Jev's 32k-token state limit and carries enough meaning to choose from. Apps with poor accessibility labels will degrade to the fallback more often.
- Screenshots are captured on every step for the report and for the fallback, but are never sent to Jev.
- Jev's per-step cost is tiny (input-only pricing, $0.042 per million tokens), so a run can afford many speculative questions per step in one request.
- The bridge owns timeouts, interruption, and cleanup, since Jev holds no state to clean up.
- Reversal cost: if Jev gains vision input, the observation could carry an image, but the loop shape stays the same. Switching to a device-agent product instead would replace the loop entirely.
