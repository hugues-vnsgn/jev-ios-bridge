# Jev today: model, API, SDK, limits

Type: research
Status: resolved
Blocked by: none

## Question

What does Jev offer as of 2026-09-24? Establish:

- the current model and what input it accepts;
- the API contract for Choice, Noul, and Score;
- request limits, price, and rate limits;
- the JavaScript SDK;
- the documented patterns closest to choosing a UI action;
- the weaknesses that matter here.

## Answer

- **Model:** `jev-1.13.0` is current, and `jev-latest` and `jev-preview` both point to it.
- **Input:** text only. Jev is stateless.
- **API:** evaluation goes through one endpoint, `POST /v1/systemone`.
- **Limits:**
  - 64k tokens per request;
  - 32k for the state plus the longest question;
  - 255 options per Choice.
- **Confidence:** Choice and Score answers carry a confidence value. Noul answers do not.
- **Price:** $0.042 per million input tokens. Output is free.
- **SDK:** `@typesafe-ai/sdk` 0.6.0 retries 408, 429, and 5xx responses twice.
- **Prior art:** TypeSafe publishes no cookbook for choosing UI actions, and ships no MCP server.

Jev cannot write text, so any value typed into the app must come from the scenario.

Evidence: [jev-model-and-api.md](../../../docs/research/jev-model-and-api.md)
