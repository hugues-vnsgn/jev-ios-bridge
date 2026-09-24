# Standards review: `39b4653...e4c5ebe`

Reviewed the fixed commit range (`e4c5ebe`, one commit) across source, spike, tests, and docs. Standards: `AGENTS.md`, `docs/agents/domain.md`, `CONTEXT.md`, and ADR-0001/0002. Tool-enforced type or formatting issues are excluded. This is the Standards axis only.

**Documented-standard breaches: none found.** The bridge owns verdicts and the loop as ADR-0001 requires; MobileBuildMCP calls stay inside the device adapter as ADR-0002 requires. The changed code uses the glossary's scenario, observation, judgment, run log, report, and watch view terms. The API key is read from the environment and is not printed or copied by the changed code.

**Judgment-call smells:**

1. **Low, Duplicated Code.** [harness.ts, tuning](../../spikes/feasibility/harness.ts#L287) and [harness.ts, held-out](../../spikes/feasibility/harness.ts#L307) independently filter qualifying rows, pick the best threshold per configuration, and apply the same winner comparator. This is the gate that must stay frozen between tuning and held-out evaluation. A shared selection function would prevent the two paths from drifting during a later gate change.
2. **Low, Mysterious Name.** [harness.ts](../../spikes/feasibility/harness.ts#L350) calls its Markdown table-cell sanitizer `md`. It escapes pipes and removes line breaks. `escapeTableCell` would describe the actual behavior at the many call sites in the owner review sheet.

No other baseline smell warranted a finding. Both findings are in the throwaway feasibility harness, so neither blocks the provisional production implementation.
