# v0.1.0 release plan

Status: preparatory phase reviewed by the main agent and in progress on `feat/v0.1-release`, 2026-09-24. The release target is a production implementation merged to `main` and a GitHub **prerelease** tagged `v0.1.0`. Ticket status and ADR status remain authoritative until changed through the tracker.

## Execution order and gates

Current checkpoint: both broad-goal evaluations failed the fixed bar. The first scored 15/20 correct actions and 7/20 accepted; the second scored 16/20 correct and 14/20 accepted, including two wrong accepted actions. [Ticket 19](issues/19-checkpoint-feasibility.md) tests ordered observable checkpoints on 20 fresh held-out cases, with the same thresholds and acceptance bar. Checkpoint execution, evidence, cancellation, and MCP integration have scripted tests; those tests do not establish live feasibility. The third corpus is being audited before owner label review and evaluation. Release and production design remain gated. Real wait-state coverage remains explicitly deferred.

| Phase | Work | Exit gate |
| --- | --- | --- |
| 0. Prepare offline | Finish ticket 06's MobileBuildMCP 2.7.1 and dedicated iOS 26.x simulator setup; check the key is available without exposing its value. Build ticket 08's throwaway harness under `spikes/feasibility/`. Capture 30 synthetic Settings, Contacts, and Reminders cases, propose labels, split by scenario into 10 tuning and 20 held-out cases, and prepare the experiment manifest. | Owner reviews every acceptable-action set, completion label, assertion label, and case/split before any Jev evaluation. Freeze questions, options, candidate and filtering rules, history rendering, thresholds, model, and gate logic in the manifest. |
| 1. Feasibility (08) | Run configurations A through D on the 10 tuning cases, select one configuration and Choice threshold by ticket 07's rule, then evaluate that frozen choice on all 20 held-out cases with `jev-1.13.0`. Record judgments, probabilities, Choice confidence, tokens, latency, failures, and abstention reasons. | At least 18/20 acceptable top-1 choices before gating, at least 16/20 accepted with zero wrong accepted actions, and zero false-pass judgments on known failing assertions. Owner reviews the results and go/no-go call. A go accepts ADR-0001; a no-go reopens it and stops implementation based on this architecture. Never tune on held-out results. |
| 2. Resolve design (09 through 15) | Use the winning observation shape to settle 09 and 10; then 11 and 12; then 13; prototype 14 over a recorded log; finally settle 15. Record choices in each ticket and update the route after each status or dependency change. | All seven tickets are resolved with concrete schemas, thresholds, timeouts, data handling, transport, call pattern, and report/watch behavior. The main agent makes routine design decisions from the evidence and records provisional defaults where data is thin. |
| 3. Prove the path (16 through 17) | Build ticket 16's **throwaway** stdio slice and run it from Claude Code with `/test-ios`. Measure ticket 17's suites and baseline on this machine; use a two-screen SwiftUI app with a planted bug to test whether its report supports diagnosis. | Tickets 16 and 17 contain linked evidence, including measurement table and sample report. Reopen any contradicted design decision. Convert the resolved tickets and ADRs into a reviewed v1 spec at `.scratch/jev-ios-bridge/spec.md` before production implementation is declared complete. |
| 4. Build v0.1.0 | Implement the production modules against the resolved spec. Integrate and review in the release worktree. | Typecheck, lint, unit and contract tests pass; a real simulator run from Claude Code proves the installed MCP and skill path; reports and watch view present the same run log; cancellation and failed Jev/device calls yield a recoverable recorded outcome. |
| 5. Release | Review the final diff, run smoke tests on the packaged artifact, document setup and data handling, then merge to `main`. Tag `v0.1.0` on the merged commit and create a GitHub prerelease with the measured limits and known gaps. | Tag and prerelease point to the tested `main` commit. Verify the release asset/package can be installed from clean checkout instructions. |

Ticket 07 is the exact feasibility protocol. Its four configurations, 0.6/0.7/0.8/0.9 Choice threshold search, Noul yes/no bounds of 0.9/0.1, consistency gates, tie-break rule, and held-out denominators govern phase 1. The harness's thresholds do **not** set production policy in ticket 11. The true key is in the original checkout's private `.env`; use it by reference for live requests after the corpus review. Keep the key out of output, artifacts, and this worktree. If the key is rejected, stop live requests and report that prerequisite.

## Work that can start before feasibility

The three implementers can prepare separately while phase 0 runs. They can define typed ports, fixtures, a log reader, an MCP server skeleton, and hermetic tests against synthetic snapshots and scripted judgments. Treat any observation fields, thresholds, stop rules, transport, and tool call pattern as provisional. Do not present a mock Jev result as ticket 08 evidence or mark tickets 09 through 17 resolved from offline work.

The main agent owns the tracker, shared public contracts, dependency changes, integration, owner review handoffs, spec, and release. Implementers own disjoint paths:

| Implementer | Files owned | Preparation now; work after gates |
| --- | --- | --- |
| A: feasibility, Jev, and observation | `spikes/feasibility/*.ts`, `src/jev/**`, `src/observation/**`, matching tests | Harness, frozen-manifest checks, question projection, and typed answer parsing |
| B: device and verification policy | `src/device/**`, `src/scenario/**`, `src/run/**`, matching tests | Dedicated-device adapter, scenario validation, bounded execution, and verdict policy |
| C: environment and corpus | `.mobilebuildmcp/config.yaml`, `spikes/feasibility/corpus/**`, environment evidence | Real captures and proposed labels, with no inference before owner review |
| Main: integration and evidence | `src/contracts/**`, `src/log/**`, `src/report/**`, `src/watch/**`, `src/mcp/**`, `src/service.ts`, `src/cli.ts`, `skills/**`, package files, integration tests | Shared interfaces, evidence, host interface, package, tracker, and release |

Coordinate any changes to `package.json`, lockfile, `tsconfig.json`, `src/contracts/**`, `README.md`, docs, tracker files, and release metadata through the main agent. The main agent reviews each interface before multiple implementers depend on it. Integration can amend a contract when a resolved ticket requires it; update its consumers in one change.

## Draft TypeScript boundaries

These interfaces are a starting seam for offline work, subject to tickets 09 through 15. Use one iOS Scenario Verification context with separate modules. The run controller alone assigns a verdict; Jev returns judgments and the device driver returns snapshots or action results. The report and watch view read recorded events.

```ts
type Verdict = 'passed' | 'failed' | 'inconclusive';
type InputAction =
  | { kind: 'tap'; candidateId: string }
  | { kind: 'type'; candidateId: string; valueKey: string }
  | { kind: 'swipe'; candidateId: string; direction: 'up' | 'down' | 'left' | 'right' };
type ActionOption =
  | { id: string; action: InputAction }
  | { id: string; action: { kind: 'wait' | 'stop-goal' | 'stop-blocked' | 'none' } };

interface Scenario {
  goal: string;
  app: { bundleId: string };
  assertions: Array<{ id: string; claim: string }>;
  values: Record<string, string>;
  preconditions?: string[];
  device?: { udid?: string };
}

interface SnapshotElement {
  id: string;                   // scoped to one snapshot
  label: string;
  role?: string;
  identifier?: string;
  actionable?: boolean;
  frame?: { x: number; y: number; width: number; height: number };
}

interface Candidate {
  elementId: string;
  label: string;
  role?: string;
  identifier?: string;
}

interface Snapshot {
  id: string;
  capturedAt: string;
  elements: SnapshotElement[];
  screenshotPath?: string;      // local evidence only; never part of a Jev request
}

interface Observation {
  snapshotId: string;
  step: number;
  text: string;                 // rendered state sent to Jev; exact shape follows 08/09
  candidates: Candidate[];
  options: ActionOption[];      // each Choice option is one complete action
}

interface DeviceDriver {
  prepare(scenario: Scenario, signal: AbortSignal): Promise<void>;
  observe(signal: AbortSignal): Promise<Snapshot>;
  act(action: InputAction, observed: Snapshot, signal: AbortSignal): Promise<void>;
  close(signal: AbortSignal): Promise<void>;
}

interface ObservationBuilder {
  build(snapshot: Snapshot, scenario: Scenario, step: number): Observation;
}

interface Judgment {
  actionOptionId: string;
  choiceConfidence: number;     // Choice field, not an assertion probability
  goalReached: number;          // Noul probability
  assertions: Record<string, number>;
  inputTokens: number;
  latencyMs: number;
}

interface JevJudge {
  judge(scenario: Scenario, observation: Observation, signal: AbortSignal): Promise<Judgment>;
}

interface RunLog {
  append(event: RunEvent): Promise<void>;
  read(runId: string): AsyncIterable<RunEvent>;
}

interface RunController {
  run(scenario: Scenario, signal: AbortSignal): Promise<{ runId: string; verdict: Verdict }>;
}
```

`RunEvent` is deliberately undefined until ticket 13 chooses its discriminated event schema. `SnapshotElement.id` names an element in one snapshot, not a durable device element. The observation builder chooses candidates from snapshot elements and turns them into complete `ActionOption`s. The device driver owns the vendor reference and, when it expires, takes a fresh snapshot and matches by identifier or role and label according to tickets 09 and 12. Ambiguous matches must return an explicit error to policy. Jev receives rendered text and questions; screenshots remain local for people. Values are selected from `Scenario.values`, never generated by Jev. Keep the vendor SDK types and MobileBuildMCP payloads inside their respective adapters.

## Design questions to close after the gate

- **09 and 10:** Preserve the successful observation configuration while defining candidate identity, filters, position, history, budget overflow, scenario files, assertion wording and ordering, and typed-value constraints. A compact snapshot's 64-target limit may force a different transport or an explicit inconclusive result.
- **11/12:** Set production step and wall limits from measured Jev latency and device behavior. Specify failed versus inconclusive, repeated screens, `none` and `blocked`, assertion timing, interruption, reference expiry, device lock, app cleanup, and whether escalation exists. A tool call cannot consult the host mid-run.
- **13/14:** Define redacted JSONL events, artifact retention, local path and permission rules, token-protected `127.0.0.1` watch URL, and watch lifetime. Document that screen text and scenario values go to TypeSafe. Check MobileBuildMCP error reporting is off.
- **15:** Choose blocking or start/status/report tools with Claude Code's background behavior and Codex's default 60 s timeout in mind. Choose `content` versus `structuredContent` deliberately; when both exist, hosts show only `structuredContent` to the model. Fix the MCP SDK line and packaging of `/test-ios`.

## Verification and release discipline

Unit tests should cover option enumeration, Jev answer validation, confidence/probability handling, observation budgets, redaction, verdict transitions, and report reconstruction. Contract tests should feed saved MobileBuildMCP snapshots and scripted Jev responses through one step, including duplicate labels, a stale reference, a failed action, `none`, contradictory completion, and cancellation. Run real simulator smoke tests after offline tests; use synthetic data and record the exact tested app and device. Run a packaged MCP client smoke test from Claude Code, since an in-process test does not prove stdio registration or `/test-ios` discovery.

Ticket 17's speed and cost comparison must use the benchmark suites and a baseline rerun on this machine; the published 93 to 103 seconds and 14 to 19 tool calls lack token counts. Report observed numbers and failures, including Jev request failures in their denominators. Do not claim savings before those measurements. The release notes should say simulator only, Claude Code first, Codex best effort, US keyboard typing, and the tested app/simulator/Xcode combination. Real iPhone UI automation, CI, automatic hooks, and Codex parity remain outside v0.1.0 unless the reviewed spec changes scope.

Before merging, confirm every required ticket is resolved from actual evidence, ADR-0001 has the owner-reviewed go/no-go status, the spec matches the implementation, secrets are absent from tracked files and logs, and the worktree diff has an independent review. If phase 1 is a no-go, stop the bridge-owned implementation path and report the failure; a `v0.1.0` prerelease of that design would misrepresent the result.
