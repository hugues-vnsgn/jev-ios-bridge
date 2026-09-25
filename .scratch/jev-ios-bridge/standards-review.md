# Standards review: `39b4653...e4c5ebe`

Reviewed the fixed commit range (`e4c5ebe`, one commit) across source, spike, tests, and docs. Standards: `AGENTS.md`, `docs/agents/domain.md`, `CONTEXT.md`, and ADR-0001/0002. Tool-enforced type or formatting issues are excluded. This is the Standards axis only.

**Documented-standard breaches: none found.** The bridge owns verdicts and the loop as ADR-0001 requires; MobileBuildMCP calls stay inside the device adapter as ADR-0002 requires. The changed code uses the glossary's scenario, observation, judgment, run log, report, and watch view terms. The API key is read from the environment and is not printed or copied by the changed code.

**Judgment-call smells:**

1. **Low, Duplicated Code.** [harness.ts, tuning](../../spikes/feasibility/harness.ts#L287) and [harness.ts, held-out](../../spikes/feasibility/harness.ts#L307) independently filter qualifying rows, pick the best threshold per configuration, and apply the same winner comparator. This is the gate that must stay frozen between tuning and held-out evaluation. A shared selection function would prevent the two paths from drifting during a later gate change.
2. **Low, Mysterious Name.** [harness.ts](../../spikes/feasibility/harness.ts#L350) calls its Markdown table-cell sanitizer `md`. It escapes pipes and removes line breaks. `escapeTableCell` would describe the actual behavior at the many call sites in the owner review sheet.

No other baseline smell warranted a finding. Both findings are in the throwaway feasibility harness, so neither blocks the provisional production implementation.

## Current WIP pass from `39b4653`

Reviewed tracked work through current `HEAD` plus staged changes, and the new source, tests, benchmark scripts, and diagnostic app visible as untracked files. This is an interim Standards pass while the v3 corpus is being captured; it does not grade the pending experiment against its spec. The earlier harness findings are resolved: tuning and held-out now call one `chooseWinner`, and the Markdown helper is `escapeTableCell`.

**Documented-standard breaches: none found.** The bridge still owns verdicts and uses MobileBuildMCP through its device adapter. The new Checkpoint glossary term matches the run and scenario types. Key handling in the changed code keeps `TYPESAFE_API_KEY` out of printed output.

**Judgment-call smell, medium: Primitive Obsession.** [RunEvent.data](../../src/contracts/index.ts#L100) is an unrestricted `Record<string, unknown>` for every event type. The run writes checkpoint proof fields, while [renderReport](../../src/report/index.ts#L21) and the watch script interpret those fields through separate unchecked lookups. A misspelled or omitted proof field can compile and still leave the host with an incomplete report. A discriminated event-data union, validated when JSONL is read, would give the evidence contract one shape. This is a design hardening suggestion, not a tooling violation or a reason to alter the frozen feasibility inputs.


## Scripted production review, `39b4653...9f8a25e`

A fresh `gpt-6-sol` reviewer at high reasoning inspected the fixed 20-commit range against AGENTS.md, the agent documentation, glossary, architecture, and accepted device boundary. This is independent of the implementation agents and separate from the Spec axis.

**Documented-standard breaches: none found.** The authored selector accompanies the temporary `resolvedRef` in action events, so the journal retains a durable target description. A preliminary claim that the ref was the only identity was withdrawn after checking the complete event.

**One low-priority heuristic: possible Duplicated Code.** `src/scripted/run.ts:51` and `src/device/index.ts:221` both compare `screenHash`, then compare element serialization without references. Both guard stale-reference handling; a future identity change must keep them aligned. A shared helper could reduce that maintenance risk. The main agent accepts this nonblocking duplication for v0.1: the algorithms currently agree, and changing the boundary is not needed to correct observed behavior.

The watch action summary shows the temporary reference, while its expandable event includes the selector. Displaying the selector directly would be easier to read, but the reviewer did not classify this as a documented breach. It does not alter target selection or recorded evidence.

Standards result: zero hard findings, one nonblocking heuristic. The separate Spec review and final measurement/doc deltas remain pending.
