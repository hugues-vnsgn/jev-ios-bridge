# Jev question design for per-step action selection and assertions

Type: research
Status: open
Blocked by: none

## Question

How should the bridge phrase its Jev questions so that one request per step yields a reliable next action, assertion results, and a stop signal, within Jev's documented limits?

Establish from the live TypeSafe docs (`https://docs.typesafe.ai/llms.txt` index; read the function-calling, fan-out, confidence-routing, pre-parsed value extraction cookbooks, the primitives pages, the state page, the models page, and the Jev 1.13 jaggedness page):

- The exact request and response shapes for Choice, Noul, and Score, including `criteria` forms and the `confidence` field semantics.
- How the function-calling cookbook structures "pick a handler and its arguments", and how that maps to "pick a candidate element and an action type". Whether action type and target should be one Choice or two.
- Whether a "no good action / scenario complete / blocked" outcome should be a Choice option or a separate Noul.
- The state limit (32k tokens) and what a pruned accessibility tree of a typical screen costs in tokens; recommend a candidate cap.
- Guidance on state structure: named JSON fields for goal, history of prior steps, current candidates. How much history helps versus bloats.
- Documented jaggedness that matters here (long lists, numeric reasoning, spatial language), since candidates carry frames.
- Retry policy, rate limits, and error classes in `@typesafe-ai/sdk`.

Write the findings, including a draft `questions.ts` sketch, to `docs/research/jev-question-design.md` on branch `research/jev-question-design`.
