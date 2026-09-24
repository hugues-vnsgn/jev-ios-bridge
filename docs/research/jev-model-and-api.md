# Jev today: model, API, SDK, limits

> Written 2026-09-24 against the first draft of the docs, dated 2026-09-21. "Where the repo docs are wrong or stale" cites line numbers in that draft; the rewrite of the same day addresses each row. Ticket references use the names in the [re-charted map](../../.scratch/jev-ios-bridge/map.md).

Researched: 2026-09-24 · Sources:

- **TypeSafe docs**, https://docs.typesafe.ai: the `llms.txt` index plus all 111 linked `.md` pages, fetched with `curl` on 2026-09-24 at 02:39 UTC. The Jev 1.13 jaggedness page reads "Last reviewed 2026-09-17". The JS changelog runs to v0.6.0 (2026-09-15) and the Python changelog to v0.7.1 (2026-09-21).
- **npm registry**, `@typesafe-ai/sdk`: `npm view @typesafe-ai/sdk version time --json` returns 0.6.0, published 2026-09-15T18:17Z. I also unpacked the tarball with `npm pack @typesafe-ai/sdk@0.6.0` and read its types and runtime.
- **Installed plugin**, `~/.claude/plugins/cache/typesafe-ai/typesafe/0.5.7/` (files dated 2026-09-19). It is byte-identical to `github.com/typesafe-ai/skills` main at commit `65a39f3` ("Release v0.5.7", 2026-09-12).
- **GitHub org** `typesafe-ai` repo list, from `gh api orgs/typesafe-ai/repos` on 2026-09-24.
- **typesafe.ai homepage**, `last-modified` 2026-09-24 02:34 UTC. I used only the pricing tile.
- **context7** `/websites/typesafe_ai`. I tried it first and found it stale on price and context budget (see §1). I used it only to show how the docs have drifted.

Citation keys used below:

- `docs:<path>:<line>` is a line in `https://docs.typesafe.ai/<path>` as fetched above. Line numbers count the raw Markdown, including its 3-line index header.
- `sdk:<file>:<line>` is a line in `package/dist/<file>` of the 0.6.0 tarball.
- `plugin:<file>:<line>` is a line under the installed plugin directory.

## Answer

1. The latest model is still **`jev-1.13.0`**. `jev-latest` and `jev-preview` both point to it, and no preview build exists. The docs name no newer model and give no deprecation notice. The release date is published only through the key-gated `GET /v1/models`, so I could not confirm it.
2. **Text only, stateless.** State is a string, a JSON object, or an array of text. Images, audio, and video are "not supported (yet)", with no date or roadmap. A request carries only `model`, `state`, and `questions`, with no session or streaming field.
3. **Endpoint.** `POST https://api.typesafe.ai/v1/systemone`, plus `GET /v1/models`.
4. **Question shapes.** A Choice takes up to 255 options. A Score takes 2 to 10 levels. A Noul takes optional true/false criteria. Choice and Score answers carry a `confidence` derived from how the probabilities are spread; a Noul answer has none.
5. **Budget.** 64k tokens per request covers the state plus all questions. A separate 32k cap covers the state plus the single longest question. The repo's "32k state limit" is imprecise. No cap on the number of questions is published.
6. **Price, limits, speed.** $0.042 per million input tokens, and output is free. Rate limits are 250k tokens/s and 1,200 requests per minute, marked "adjusting dynamically". Documented error codes are 401, 422, 429, and 529. The docs claim about 100 ms for most queries; cookbook runs measured 0.09 to 0.51 s.
7. **JS SDK.** `@typesafe-ai/sdk` 0.6.0 on Node 20 or newer. By default it retries 408, 429, and 5xx twice, with a 10 s timeout per attempt.
8. **Agent loops.** No TypeSafe page covers UI, browser, or computer-use agents, and the docs call System One "not agents". The closest recipes are function calling, line-id search, and skill suggestion.
9. **Integrations.** TypeSafe ships no MCP server. Its Claude Code plugin (0.5.7) is a single SKILL.md.

## Findings

### 1. Latest model, ids, changes, deprecations

**Models on offer**

| Name | Kind | Resolves to | Source |
| --- | --- | --- | --- |
| `jev-1.13.0` | versioned id | itself | docs:models.md:11 |
| `jev-latest` | alias ("most recent stable, official release"; SDK default) | `jev-1.13.0` | docs:models.md:33; sdk:index.d.mts:208 |
| `jev-preview` | alias ("most recent release, whether or not official") | `jev-1.13.0`; "There is no preview build available right now" | docs:models.md:34,37 |

- **Listing.** `GET /v1/models` "currently lists the aliases". It says versioned ids "are accepted by the `model` field whether or not they appear in the list" (docs:models.md:60).
- **Pinning.** Aliases move when a release ships. The response's `model` field reports the versioned id that answered. The docs advise pinning the versioned id once thresholds are tuned (docs:models.md:40).
- **`jev-1.12`, the previous id.** Most cookbooks still set `TYPESAFE_MODEL = "jev-1.12"`, with runs dated 2026-07-31 to 2026-09 (for example docs:cookbooks/function_calling.md:69, docs:cookbooks/sde_cascade.md:14,19, docs:cookbooks/skill_suggestion.md:99). The Models page does not list `jev-1.12` and states no deprecation or sunset date. A grep of all 111 pages for `deprecat|sunset|retire|end of life` returned nothing. Whether `jev-1.12` is still accepted is **unverified**.
- **Release date of `jev-1.13.0`.** Not stated in the docs. `GET /v1/models` returns a `release_date` per name (docs:models.md:99), but it needs an API key. Indirect bounds:
  - The SDE cascade page still used `jev-1.12` at prices "checked September 15, 2026" (docs:cookbooks/sde_cascade.md:14,19).
  - The jaggedness page was "Last reviewed 2026-09-17" (docs:model-jaggedness/jev-1.13.md:10).
  - So a release around 2026-09-15 to 2026-09-17 is likely, but **unverified**.
- **Changes after 1.13.** None published. No model is newer than `jev-1.13.0` as of 2026-09-24.
- **Changes from 1.12 to 1.13.** There is no model changelog; the only per-version pages are the jaggedness notes. Two documented conditions differ from an older doc snapshot in context7. Neither can be tied to the 1.13 release (**unverified**):
  - **Price.** context7's copy of the SDE cascade page lists "`jev-1.12` at $0.10 / $0.30 … as of 2026-07". The live page lists $0.042 / $0.00 (docs:cookbooks/sde_cascade.md:19). The live page also notes its chart "costs have not been recalculated at the current Jev rate" (docs:cookbooks/sde_cascade.md:621-622). The structure-recovery page still says "$0.0015" in prose while its own code prints "$0.0003" (docs:cookbooks/autoformat.md:527,530).
  - **Context budget.** context7's copy of the Primitives page says "The number of questions in one request is limited only by the request's token budget … around 32,000 tokens". That sentence is gone from the live page. The live Models page gives 64k per request and 32k for the state plus the longest question (docs:models.md:15,20). The repo's "32k state limit" probably comes from the older wording.
- **The "Jev 1.13 jaggedness page" the repo cites** still exists and is current (docs:llms.txt:49; docs:model-jaggedness/jev-1.13.md).
- **Dead link in TypeSafe's own skill.** The plugin skill links a migration guide (plugin:skills/typesafe-ai/SKILL.md:53) that now returns 404 (`curl https://docs.typesafe.ai/migrating-to-v1.md` gives HTTP 404).

### 2. Modalities and statelessness

**Text only: confirmed.**

- "Text only. String, JSON object, or array of text values. No image, audio, or video input." (docs:models.md:16)
- "Pre-process non-text inputs (images, audio, video, binaries) into text or structured fields before sending them as `state`." (docs:models.md:21)
- "Images, audio, and video are not supported (yet)." (docs:concepts/system-one.md:16; docs:concepts/state.md:32)
- The word "(yet)" is the only forward-looking statement. No page gives a roadmap, a date, or a preview model with image input. `jev-preview` points to `jev-1.13.0` (docs:models.md:34,37).
- English is the primary training language. Other languages, including CJK scripts, "are handled but not equally well" (docs:models.md:52).

**Stateless: confirmed by the contract, never stated in that word.**

- The HTTP request body has exactly three fields: `state`, `model`, and `questions` (docs:api.md:23-39). The SDK request type has only `state`, `questions`, and an optional `model` (sdk:index.d.mts:147-154). Neither has a session, conversation, or continuation field.
- "Each request evaluates one state against one or more questions" (docs:concepts/state.md:11).
- Questions within one request are independent: "one answer does not become context for another question" (docs:primitives.md:456).
- No page contains the word "stateless". The API has no streaming parameter. The coding-agents page contrasts Jev with LLMs that "stream text, call tools", saying "Jev does none of that" (docs:introduction/coding-agents.md:19).
- Jev "does not generate code or choose its own next action" (docs:concepts/how-to-build-with-system-one.md:238). This supports ADR-0001's "Jev decides, the bridge acts". Jev only decides among options that code supplies.
- Jev is not trained on customer requests and is not fine-tuned per account (docs:models.md:44,56).

### 3. API contract

**Endpoints**

| Method | Path | Purpose | Source |
| --- | --- | --- | --- |
| `POST` | `https://api.typesafe.ai/v1/systemone` | Evaluate questions against a state. Auth is `Authorization: Bearer <key>`. | docs:api.md:13-17 |
| `GET` | `https://api.typesafe.ai/v1/models` | List model names and aliases | docs:models.md:60-66 |

**Request**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `state` | string, object, or array | yes | docs:api.md:23-25 |
| `model` | string | yes on the wire | The SDK fills it from `defaultModel`, which falls back to `jev-latest` (docs:api.md:27-29; sdk:index.d.mts:152-153,208) |
| `questions` | map of id to Question | yes | Ids are "not sent to the underlying model and … not used in inference" (docs:api.md:31-37; docs:primitives.md:275-277). Choice option names are sent to the model (docs:primitives/choice.md:284). |

**Question shapes and `criteria` forms.** All three types share `type` and `instructions`. `instructions` may be a string, an object, or an array (docs:api.md:56-69).

| Type | `criteria` | Limits | Source |
| --- | --- | --- | --- |
| `noul` | Optional `{ "true": …, "false": … }`; each value is a string, object, or array | none | docs:api.md:83-95 |
| `choice` | Required map of option name to description (string, object, array, or `null`) | "a maximum of 255 options per Choice" | docs:api.md:124-126 |
| `score` | Required ordered array of level descriptions (string, object, or array) | "at least two levels; the API accepts up to 10" | docs:api.md:162-164 |

- **SDK looseness.** The SDK types are looser than the HTTP reference. `instructions` is optional or nullable, and Score and Noul criteria entries may be `null` (sdk:index.d.mts:39-79).
- **Client-side checks.** The SDK rejects an empty question map and a Score with fewer than two criteria before sending (sdk:index.mjs:346-352).
- **Structured criteria.** Criteria may be objects. The docs' example gives each option fields such as `what`, `not_for`, and `examples`. These field names are free-form, and the model sees them (docs:primitives/choice.md:599-663).
- **Path references.** Questions can point into a structured state with backticked paths such as `` `ticket.messages[0].text` `` (docs:primitives.md:314-358).

**Response**

`model` (the versioned id that answered), `answers` (keyed by your ids), and `usage` (`input_tokens`, `output_tokens`) (docs:api.md:184-219).

| Answer | Fields | Source |
| --- | --- | --- |
| Noul | `type`, `noul` (0 to 1, the probability of yes). No `confidence`. | docs:api.md:225-231; docs:primitives/noul.md:354 |
| Choice | `type`, `choice` (the top option), `probabilities` (every option, summing to 1), `confidence` | docs:api.md:246-266 |
| Score | `type`, `score` (probability-weighted, can fall between levels), `legend` (index to description), `probabilities` (keyed by level index as a string), `confidence` | docs:api.md:283-307 |

**What `confidence` means**

- It is "a statistic computed from the probability distribution … a flatter distribution means lower confidence" (docs:confidence.md:143-157).
- The page's demo computes `(n·p_max − 1)/(n − 1)`. The prose calls this an approximation for three options (docs:confidence.md:28-31,138).
- Published examples fit it within rounding. Probabilities 0.88/0.12/0.00 give confidence 0.81, where the formula gives 0.82 (docs:api.md:275-276). A 0.95 peak over three levels gives 0.92, where the formula gives 0.925 (docs:api.md:317-318). The exact formula is **unverified**.
- For a Choice, low confidence "often means none of the options are a clear winner". For a Score, it often means the levels are ambiguous or the state is thin (docs:confidence.md:157).
- The docs warn that confidence "summarizes distribution concentration, not overall workflow correctness or permission to act" (plugin:skills/typesafe-ai/SKILL.md:133-134).

**Limits, cost, speed, errors**

| Item | Value | Source |
| --- | --- | --- |
| Questions per request | No count limit is published. The token budget bounds it. The largest documented requests have 54 questions (docs:cookbooks/function_calling.md:191) and 62 (docs:cookbooks/autoformat.md:379). | docs:models.md:15,20 |
| Context | "64k tokens per request; 32k tokens for `state` plus the longest question". The 64k covers the state plus all questions. | docs:models.md:15,20 |
| Choice options | 255 max | docs:api.md:125 |
| Score levels | 2 to 10 | docs:api.md:163 |
| Price | $42 per billion / $0.042 per million tokens. "Charged per input token. Output tokens are free." The homepage tile says "$42 Per Billion input tokens". Responses still report `output_tokens`. | docs:models.md:13,18; docs:api.md:217 |
| Rate limits | 250,000 tokens/s and 1,200 requests/min. Going over either returns 429. "Rate limits are adjusting dynamically … can change without notice." Higher limits come with custom or enterprise plans. | docs:models.md:14,19,23-25 |
| Latency (claimed) | "Most queries complete in about 100 ms" and "real-time speeds (150ms)". No percentiles or SLA are published. | docs:concepts/how-to-build-with-system-one.md:290; docs:concepts/use-case-map.md:19 |
| Latency (measured in cookbooks) | Mean round trip 114 ms for 8 Choices (`jev-latest`, 2026-09-11). 0.27 s for 13 questions over the GDPR article. 0.32 s for 16 questions and 0.51 s for 62. 0.09 to 0.31 s for a 182-option Choice plus 3 Nouls. The last three runs used `jev-1.12`. | docs:cookbooks/consistency_choice_cookbook.md:50,626-629; docs:cookbooks/parallel_questions.md:326; docs:cookbooks/autoformat.md:525-526; docs:cookbooks/skill_suggestion.md:540-555 |
| Parallelism | "Adding questions barely changes the response time." Batching 13 questions was 12.2x cheaper and 10.0x faster than 13 separate calls. The Primitives page gives 11.5x and 9.6x for the same comparison, an inconsistency inside the docs. | docs:primitives.md:362,442; docs:cookbooks/parallel_questions.md:329 |
| HTTP errors | 401 bad or missing key; 422 validation (body names the field); 429 rate limit; 529 overloaded | docs:api.md:325-334 |
| Retry guidance | On 429 or 529, "retry the request with exponential backoff". The SDKs do this by default and honor `retry-after`. | docs:api.md:336-338; docs:models.md:19 |

### 4. JS SDK

- **Package.** `@typesafe-ai/sdk`. The repo's assumption is correct.
  - `npm view @typesafe-ai/sdk version time --json` returns `"version": "0.6.0"` with timestamps `0.5.7: 2026-09-12T04:13:21Z` and `0.6.0: 2026-09-15T18:17:19Z`.
  - dist-tags are `latest: 0.6.0`. Maintainers are `@typesafe.ai` addresses. The source repo is `github.com/typesafe-ai/typesafe-sdk-js`.
- **Node.** `engines: { "node": ">=20" }` (npm view; docs:sdk/javascript.md:11). It requires a global `fetch` or an injected one (sdk:index.mjs:395). The package ships ESM, CJS, and `.d.mts`/`.d.cts`.
- **Breaking change in 0.6.0.** Score `criteria` is now an ordered array instead of an integer-keyed dictionary (docs:sdk/javascript/changelog.md:7-11).

**Call shape** (sdk:index.d.mts:250-299, 382-402):

```ts
import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
const client = new TypeSafeClient({ /* apiKey, baseURL, defaultModel, timeout, retry, logLevel, fetch */ });
const res = await client.systemOne(
  { state, questions: { next: choice("…", { e5: null, none: "…" }), done: noul("…") }, model: "jev-1.13.0" },
  { signal, timeout, retry, headers },           // RequestOptions, per call
);
res.answers.next.choice;       // typed as "e5" | "none"
res.model; res.usage.input_tokens;
const { data, requestId } = await client.systemOne(req).withResponse();
await client.models.list();    // ModelCard[] { name, description, release_date }
```

**Key types**

- `SystemOneRequest<Q>`, `SystemOneResult<Q>` (answers are inferred per question id), `ChoiceQuestion<T>`, `ChoiceResponse<T>` (`choice` is typed as `keyof T`), `ScoreQuestion<T>`, `ScoreResponse<T>`, `NoulQuestion`, `NoulResponse`, `Usage`, `RetryPolicy`, `RequestOptions`, and `TypeSafeClientConfig` (sdk:index.d.mts:35-228).
- Extra properties on a request object are forwarded to the API (sdk:index.d.mts:145).

**Environment variables.** `TYPESAFE_API_KEY` (required), `TYPESAFE_BASE_URL` (default `https://api.typesafe.ai`), `TYPESAFE_DEFAULT_MODEL` (default `jev-latest`), and `TYPESAFE_LOG_LEVEL` (default `warn`). No other variables are read (sdk:index.mjs:56-62). At `debug` level the SDK logs request bodies unredacted (sdk:index.d.mts:210-215).

**Retries, defaults** (sdk:index.mjs:73-88; sdk:index.d.mts:159-190):

- 2 retries after the first attempt.
- Retries on 408, 429, and 500 to 599 (so 529 is included), on connection errors, and on timeouts.
- Backoff starts at 500 ms and doubles up to 5 s, with 25% jitter.
- Honors `retry-after-ms` and `Retry-After` up to 60 s.
- 10 s timeout per attempt, with no total retry budget. The Python SDK has a total budget; the JS SDK does not.
- Each retry sends an `X-TypeSafe-Retry-Count` header (sdk:index.mjs:591-595).
- Worst case for one call with defaults: about 31.5 s without `Retry-After` (3 × 10 s plus 0.5 s and 1 s of backoff), and about 150 s if the server asks for 60 s twice.

**Error classes** (sdk:index.d.mts:326-375)

- Base class `TypeSafeError`, raised for configuration problems and client-side validation.
- `APIError`, with `status`, `headers`, `body`, and `requestId`. Its subclasses:
  - `BadRequestError` 400
  - `AuthenticationError` 401
  - `PermissionDeniedError` 403
  - `NotFoundError` 404
  - `UnprocessableEntityError` 422
  - `RateLimitError` 429, with `retryAfterMs`
  - `InternalServerError` for any status of 500 or above, including 529 (sdk:index.mjs:191-198)
- `APIConnectionError`, with subclass `APITimeoutError` (`timeoutMs`).
- `APIUserAbortError`.

### 5. Patterns that fit "goal + history + candidates → next action, assertions, done or blocked"

No docs page covers UI, browser, computer-use, or game agents. The cookbook index (docs:llms.txt:24-42) has none, and a grep of all pages for those terms found only the use-case map's single line: "Fast and smart enough to be programmed to play games or embedded into a UI" (docs:concepts/use-case-map.md:19).

The build guide frames System One as "for building AI-powered software, not agents". It says "Avoid agent `while` loops when a software workflow can express the same behavior" (docs:concepts/how-to-build-with-system-one.md:238,308).

"Respond to changing state" appears only in TypeSafe's plugin skill: "Code can retain goals and observations while fresh judgments guide the next bounded step. Keep inferred state distinct from observed facts, and check freshness before applying a result to a changed situation." (plugin:skills/typesafe-ai/SKILL.md:87-89). No docs page expands on it.

| Pattern | How it structures state | How it structures questions | Fit here |
| --- | --- | --- | --- |
| **Function calling** (docs:cookbooks/function_calling.md) | The user command, as a string | One Choice `__tool__` over function names, with descriptions. Speculatively, one Choice per closed-set argument of **every** function, plus a `stated` Noul per optional argument and one Noul per member of a set argument: 54 questions in one request. Code reads only the chosen function's answers. The call's confidence is the minimum over the judgments used, not their product (lines 116-201, 317-322). Option keys are the literal argument values (157). | Directly maps to "action type + target". Action type becomes the `__tool__` Choice, and each action's target and value become speculative per-action Choices. It answers the first map's "one Choice or two" question, now part of Feasibility: the cookbook uses one per decision, all in the same request. |
| **Speculative fan-out** (docs:patterns/fan-out.md:238-351) | One state | All questions any branch might need, in one request. Code ignores the irrelevant ones. | Ask for the next action, all assertion checks, done, and blocked in one request per step. |
| **Confidence-gated routing** (docs:patterns/confidence-routing.md:240-306) | The user command | One Choice with an `other` option. Code applies a floor (0.6) that routes to a human, plus a stricter per-action threshold for risky actions (0.85). | Low confidence triggers the host-agent vision fallback. Destructive taps (delete, purchase) get a stricter threshold. |
| **Pre-parsed value extraction** (docs:cookbooks/pre_parsed_value_extraction_cookbook.md) | The document | Code finds candidates with a regex tuned to over-find. One Choice whose options **are** the candidate strings, with `null` descriptions, plus a `none` option. Code copies the chosen value verbatim (lines 9-27, 96-110). Past 255 candidates, narrow in two stages (306-310). | The candidate elements are the options. Text to type can only be one of the values code extracted from the scenario, because Jev does not generate text. |
| **Line-by-line search** (docs:cookbooks/semantic_find.md) | The document with every line prefixed by an id (`L052\| …`); 218 lines, 43,980 characters | One Choice whose options are the line ids with `null` criteria, so the content stays in state and the question stays small. In the **same request**, an "exists" Noul, because "Choice question probabilities always add up to 1, so a line ranks first even when none answer" (lines 24-31, 122-161). | The closest template for "pick an element ref". The exists Noul is the "no candidate advances the goal" or "blocked" signal. |
| **Skill suggestion** (docs:cookbooks/skill_suggestion.md) | `{request, recent_context}` | Request 1: a Choice over all 182 skills, with a one-line description each, plus three gate Nouls on whether any skill is needed. Request 2: a Choice over the top 3, now with full text, plus one `fits` Noul per candidate. Either request may return nothing (lines 9-27, 435-456, 567-577, 687-696). | The only cookbook about an **agent turn**. It is a two-stage option for crowded screens and near-duplicate elements. The Choice settles "which", and the Nouls settle "whether" (670-672). |
| **Re-ranking** (docs:cookbooks/rerank_typesafe.md) | `{query_excerpt, candidate_passage}`, one pair per request | One Noul per (query, candidate) pair, 1,200 calls run concurrently, then sorted by `noul` (93-177, 385-440) | A pointwise alternative when candidates exceed 255, or when each candidate needs an absolute score rather than a share of 1. It costs more requests against the 1,200 RPM limit. |
| **SDE cascade** (docs:cookbooks/sde_cascade.md) | The extracted record, the field spec, and the source | A per-field battery of Nouls framed so that "true = something is wrong". Escalate to a reasoning model if any flag exceeds 0.7, a max gate rather than a mean (340-356, 551-556). | Jev acts as a verifier and escalation gate in front of the host agent's vision fallback. |
| **Intent routing** (docs:patterns/intent-routing.md:240-329) | The message | An intent Choice plus a complexity Score. Routes to deterministic code, a specialist LLM, or a human. | The shape of "Jev handles it, or hand off to the host agent". |
| **Smart-home demo** (docs:demos/smart-home.md:17-57) | The user request | Speculative Choices for category, domain, device, and action. A Noul detects compound requests, and an LLM then splits them. An LLM also handles conversational requests. | The closest to "command → target + action". Compound scenario steps would need splitting outside Jev. |
| **Hierarchical classification** (docs:primitives/choice.md:357) | The document | Choice level by level, with beam search over probabilities | One way to handle more than 255 candidates, for example container first, then element. |

**Illustrative request body for one step.** This is an **illustration, not a design decision.** The element ids, the `area` field, the history shape, the question set, and the model pin are placeholders for the Feasibility and Observation schema tickets to decide. I checked that it is valid JSON. I did not send it (no API key), so its token count is unknown.

```json
{
  "model": "jev-1.13.0",
  "state": {
    "scenario": {
      "goal": "Sign in as demo@example.com with password hunter2 and reach the Home screen.",
      "assertions": { "a1": "After signing in, the screen greets the user by name." }
    },
    "history": [
      {"step": 1, "action": "tap", "element": "Email text field", "observed_after": "keyboard shown"},
      {"step": 2, "action": "type", "element": "Email text field", "text": "demo@example.com", "observed_after": "field shows demo@example.com"}
    ],
    "screen": {
      "app": "com.example.shop",
      "title": "Sign In",
      "elements": {
        "e3": {"role": "text field", "label": "Email", "value": "demo@example.com", "area": "upper half"},
        "e4": {"role": "secure text field", "label": "Password", "value": "", "area": "upper half"},
        "e5": {"role": "button", "label": "Sign In", "enabled": true, "area": "middle"},
        "e6": {"role": "button", "label": "Forgot password?", "enabled": true, "area": "middle"},
        "e7": {"role": "button", "label": "Create account", "enabled": true, "area": "bottom"}
      }
    },
    "typeable_values": {"v1": "demo@example.com", "v2": "hunter2"}
  },
  "questions": {
    "action": {
      "type": "choice",
      "instructions": "Given `scenario.goal`, what was already done in `history`, and what is on `screen`, which kind of input moves toward the goal next?",
      "criteria": {
        "tap": "Tap one element in `screen.elements`.",
        "type_text": "Type one value from `typeable_values` into a text field in `screen.elements`.",
        "scroll": "Scroll, because the element needed next is not in `screen.elements`.",
        "wait": "The screen is still loading or changing; touch nothing yet.",
        "done": "`screen` already shows that `scenario.goal` is reached.",
        "blocked": "No input on `screen` can move toward `scenario.goal`, for example an error message or a missing control."
      }
    },
    "tap_target": {
      "type": "choice",
      "instructions": "If the next input is a tap, which element in `screen.elements` should be tapped to move toward `scenario.goal`?",
      "criteria": {"e3": null, "e4": null, "e5": null, "e6": null, "e7": null, "none": "No element on this screen should be tapped."}
    },
    "type_into_e3": {
      "type": "choice",
      "instructions": "Which value from `typeable_values`, if any, should be typed into `screen.elements.e3` to follow `scenario.goal`?",
      "criteria": {"v1": null, "v2": null, "none": "Nothing should be typed into this field."}
    },
    "type_into_e4": {
      "type": "choice",
      "instructions": "Which value from `typeable_values`, if any, should be typed into `screen.elements.e4` to follow `scenario.goal`?",
      "criteria": {"v1": null, "v2": null, "none": "Nothing should be typed into this field."}
    },
    "some_element_advances": {
      "type": "noul",
      "instructions": "Does at least one element in `screen.elements` let the user move closer to `scenario.goal`?"
    },
    "goal_reached": {
      "type": "noul",
      "instructions": "Does `screen` show that `scenario.goal` has been reached?"
    },
    "assert_a1": {
      "type": "noul",
      "instructions": "Does `screen` greet the user by name?",
      "criteria": {"true": "A visible label on `screen` contains a greeting with a person's name.", "false": "No greeting with a name is visible on `screen`."}
    }
  }
}
```

Each choice in that sketch traces to a documented pattern:

- The ids-with-`null`-criteria layout keeps the longest question small, as in the line-by-line search recipe.
- The per-field `type_into_*` questions follow function calling's speculative per-argument questions. They exist because questions cannot see one another's answers (docs:primitives.md:456).
- `typeable_values` follows pre-parsed extraction, because Jev cannot generate text (docs:model-jaggedness/jev-1.13.md:139-143).
- The separate `goal_reached` and `some_element_advances` Nouls follow line-by-line search's exists check and the jaggedness page's note that Choice and Noul answer different questions (docs:model-jaggedness/jev-1.13.md:137).
- Coarse `area` words instead of pixel frames follow the numbers guidance in §6. They are an inference, since spatial language is undocumented.

### 6. Documented weaknesses that matter here

All rows cite docs:model-jaggedness/jev-1.13.md unless another source is given. The page's summary line: "It may struggle with tasks that require additional levels of indirection. It can be quite literal … It struggles with tasks that require numeric precision" (13).

| Concern | What the docs say | Source |
| --- | --- | --- |
| Long candidate lists | "does not count reliably … items in a long list … error grows with the size". Accuracy falls as the state fills with unrelated content ("context rot"). The docs advise filtering in code first. Choice hard cap is 255. Documented working sizes: 182 skills and 218 lines. No page gives accuracy as a function of option count. | 41-45, 94-98, 151; docs:api.md:125; docs:cookbooks/skill_suggestion.md:454-456; docs:cookbooks/semantic_find.md:137-140 |
| Spatial or positional language | **Not documented.** No page mentions spatial reasoning, coordinates, layout, or option-order effects. The closest item: given RGB or hex values, the model "cannot reliably judge whether two values are near each other". The docs advise converting in code to "the computed number or a named bucket". Raw frame coordinates are likely to share this weakness (inference). | 66-72 |
| Numbers | "Jev is not a calculator … implementing any mathematical logic in code". It "reads dates as text, not as ordered quantities". Do not interpolate Score expectations into exact magnitudes. | 35-37, 74-86 |
| Negation | "Scoping words, negations, and implied conditions are read at face value". "Double negatives or complex indirection are answered less reliably". A Noul and its negation need not sum to 1 (a worked example gives 0.72 + 0.47). The docs advise phrasing a Noul so that a high value means yes, and warn that inverted true/false criteria perform worse. | 31-33, 88-92, 129-137, 112; docs:primitives/noul.md:384 |
| Near-duplicate options | "When two options are similar and the model keeps confusing them, describe each one with an object", with `what`, `not_for`, and `examples` fields. With 60-character descriptions, the skill-suggestion cookbook confused a skill that edits `.pptx` files with one that authors them until a second request supplied full text. | docs:primitives/choice.md:601-663; docs:cookbooks/skill_suggestion.md:14-20, 563-565, 667-668 |
| Choice vs Noul thresholds | Don't carry a Noul threshold over to a Choice. The Choice is relative ("which"), while each Noul is absolute and "can be low for all of them". | 116-137 |
| Adversarial state | "Content written to adversarially steer the model … an injected instruction … can move the answer." On-screen text in the app under test is state. | 104-108 |
| Generation | Jev "is not trained to generate text". Extract candidate values elsewhere and let Jev choose among them. | 139-143 |
| Non-English | English is best. Other languages are handled "not equally well". | docs:models.md:52 |

### 7. TypeSafe's own agent integrations

- **Claude Code plugin `typesafe@typesafe-ai` 0.5.7.** The installed files are:
  - `.claude-plugin/plugin.json` (name `typesafe`, version `0.5.7`, repo `github.com/typesafe-ai/skills`, lines 2-11)
  - `.claude-plugin/marketplace.json` (marketplace `typesafe-ai`, one plugin, lines 1-15)
  - `README.md`, two copies of `LICENSE`, and `skills/typesafe-ai/SKILL.md` (149 lines)
- **What the plugin lacks.** It has no `.mcp.json`, commands, hooks, or agents. It is one skill that points agents at the live docs (plugin:skills/typesafe-ai/SKILL.md:26-53). It gives design guidance (55-121) and composition and verification advice (123-149), and can be invoked as `/typesafe:typesafe-ai` (plugin:README.md:34).
- **Upstream is identical.** Running `diff` against `raw.githubusercontent.com/typesafe-ai/skills/main/skills/typesafe-ai/SKILL.md` finds no differences. The repo tree has only these files, and its last commit is `65a39f3`, "Release v0.5.7", dated 2026-09-12.
- **Codex and other agents** get the same skill through `npx skills add typesafe-ai/skills --skill typesafe-ai` (docs:agent-skill.md:23-29). The docs say the skill gives "Claude Code, Codex, and other agents full context on the Jev API" (docs:introduction/coding-agents.md:27).
- **Jev cannot power a coding agent.** "Jev is **not** a drop-in replacement for the LLM behind Claude Code … There is no `model: "jev-latest"` setting that turns your coding agent into a Jev-powered agent" (docs:introduction/coding-agents.md:9,19).
- **No MCP server.** The `typesafe-ai` GitHub org's public repos are `skills`, `typesafe-sdk-js`, `typesafe-sdk-python`, `system-one-adapter-python`, `typesafe-ai.github.io`, `daggerverse`, `pulumi-clickhouse`, `Overwatch`, and forks of `vllm` and `LLaDA`. None is an MCP server. `system-one-adapter-python` is "a drop-in replacement for `typesafe_sdk`'s `system_one` … backed by LLM APIs", for comparing TypeSafe against an LLM. It is Python only.
- **Third-party packages exist but were not evaluated.** npm search lists community packages that wrap Jev, some as MCP servers (for example `jev-dev-harness`, `jev-repl`, `pi-typesafe`). Vercel publishes `@ai-sdk/typesafe-ai`. None is published by TypeSafe maintainers.

## Where the repo docs are wrong or stale

| File:line | What it says | What is true | Source |
| --- | --- | --- | --- |
| `docs/adr/0001-bridge-perceives-and-acts-jev-decides.md:22` | "fits Jev's 32k-token state limit" | 32k covers the **state plus the single longest question**. 64k covers the state plus all questions. A candidate list placed in Choice criteria counts against the 32k too. | docs:models.md:15,20 |
| `.scratch/jev-ios-bridge/issues/03-jev-question-design.md:16` | "The state limit (32k tokens)" | Same correction as above | docs:models.md:15,20 |
| `docs/adr/0001-bridge-perceives-and-acts-jev-decides.md:8` | "exposed at one endpoint, `POST /v1/systemone`" | That is the one **evaluation** endpoint. `GET /v1/models` also exists. | docs:models.md:60; docs:api.md:14 |
| `docs/architecture.md:46` | Request `{state, questions…}` | `model` is required on the wire. The SDK supplies `jev-latest` unless told otherwise, and aliases can move under tuned thresholds. | docs:api.md:27; sdk:index.d.mts:208; docs:models.md:40 |
| `docs/architecture.md:47` | "answers with probabilities and confidence" | True for Choice and Score only. A Noul answer is a single `noul` value, with no `probabilities` map and no `confidence`. | docs:api.md:223-231; docs:primitives/noul.md:354 |
| `docs/architecture.md:95` | "`@typesafe-ai/sdk` wrapper, retries" | The SDK already retries by default: 2 retries on 408, 429, and 5xx (including 529), on connection errors, and on timeouts, honoring `Retry-After`. Retrying in a wrapper as well would multiply attempts. | sdk:index.mjs:73-88 |
| `docs/architecture.md:113` | "`TYPESAFE_JEV_API_KEY` accepted as an alias" | The SDK reads only `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`, and `TYPESAFE_LOG_LEVEL`. An alias would have to be bridge code. | sdk:index.mjs:56-62 |

These claims were checked and hold:

- `CONTEXT.md:9` (text-only, stateless, typed judgments, never acts).
- ADR-0001:8, as far as it goes: text and JSON only, no image, audio, or video, no sessions or streaming.
- ADR-0001:24: $0.042 per million tokens, input only.
- `.scratch/jev-ios-bridge/map.md:15`: Node 20 or newer and `@typesafe-ai/sdk`.
- Issue 03:11: the "Jev 1.13 jaggedness page" exists and is current.

## Consequences for the plan

These are flagged for the owning tickets and are not decided here.

- **Budget accounting (Feasibility, Observation schema).** Where candidates live decides which budget they consume. With element ids as options and `null` criteria, the Choice stays small and the 32k cap is effectively the state. With descriptions in the criteria, the list counts against both caps. The prototype should log `usage.input_tokens` per step, since the docs give no token cost for a screen.
- **Candidate cap (Observation schema).** 255 is the hard ceiling per Choice, including any `none` or `blocked` option. Bigger screens need a two-stage scheme: a window then an element, or a shortlist then a re-check, or pointwise Nouls.
- **Done and blocked (Feasibility).** The docs support using both a `none`/`blocked` option in the action Choice **and** independent Nouls. A Choice always sums to 1, so it always names a winner.
- **Confidence thresholds (Step-loop policy).** If the published approximation holds, confidence for the same top probability depends on the number of options. For example, p_max = 0.6 gives about 0.20 with 2 options, about 0.52 with 6, and about 0.59 with 40. This is an inference from docs:confidence.md:28-31. Thresholds may need tuning by candidate-count bucket, and against a pinned `jev-1.13.0` rather than `jev-latest`.
- **Typed text (Scenario language).** Jev cannot produce text to type. Values must come from the scenario, either as literal strings code can extract or as named values. This is a constraint on the scenario language.
- **Geometry (Observation schema).** Keep numeric frames out of the observation, or convert them in code to named areas or order. Scenario wording like "the second row" or "the button at the top" is untested territory, because the docs cover no spatial language. The prototype (ticket 10) should include such a case.
- **Timeouts (Step-loop policy).** One SDK call can take about 31.5 s by default, or about 150 s when honoring `Retry-After`. The per-run wall-clock timeout needs to cover this. The bridge can also pass an `AbortSignal` or tighten `retry` and `timeout`.
- **Framing (ADR-0001 review).** TypeSafe positions System One as "not agents" and advises against agent `while` loops. The bridge's bounded, code-owned loop with Jev choosing among code-supplied candidates matches only the plugin's "Respond to changing state" paragraph. No cookbook covers it, so the project carries the evaluation burden.
- **Prompt injection.** App screen text is state, and the docs say injected instructions in state can move answers. Scenarios over apps with user-generated content could be steered.
- **Localization.** Non-English app UIs will have lower accuracy.
- **Secrets in artifacts.** Values the bridge types (passwords) sit in `state`. The planned per-run Jev payload artifacts (`docs/architecture.md:117`) and SDK `debug` logs would store them unredacted.
- **No reusable MCP server (host-agent loop, since ruled out).** For option 3 (host-agent-owned loop), the bridge would have to expose Jev judgment tools itself. The TypeSafe skill helps humans and agents write the questions.
- **Offline comparison.** `system-one-adapter-python` can run the same questions on an LLM for a quality or latency comparison, but it is Python only.

## Unverified

- The `jev-1.13.0` release date, and what changed from `jev-1.12`. There is no model changelog, and `GET /v1/models` needs a key.
- Whether `jev-1.12` is still accepted, and whether the short form `jev-1.13` resolves. The jaggedness page's code example uses `model="jev-1.13"` (docs:model-jaggedness/jev-1.13.md:50).
- Whether the price change ($0.10/$0.30 to $0.042/$0) and the budget change (about 32k shared to 64k/32k) came with 1.13. Both are seen only by comparing context7's older snapshot with the live docs.
- Any cap on the number of questions per request other than the token budget.
- The exact `confidence` formula for n options. The docs call their formula an approximation.
- Latency percentiles and any SLA, and the latency and token cost for this project's payloads.
- How accuracy varies with the number of Choice options and with option order, and how Jev handles spatial or positional language.
- How much step history helps or hurts. The docs give no guidance beyond "include only the context relevant".
- Whether rate limits apply per key or per account, and their current values. The docs say limits "can change without notice".
- The 422 error body schema.
- The homepage FAQ answers, which render client-side and could not be read.
- Whether TypeSafe endorses the Vercel `@ai-sdk/typesafe-ai` provider or any community package.
