# Admission decision

Date: 2026-10-08. Baseline inspected: `2ae75e5`. Scope: ticket 03 only; planning and isolated host diagnosis, no product edits or device operations. This recommendation resolves the design question; it does not certify an implementation.

## Decision and invariants

Put one deep admission module below all current iOS bridge execution paths, shared by observed actions, scripted/driven runs, preparation/capture entry points, and inventory preparation. The module owns canonical identity, durable intent, ownership, quarantine and terminal publication. Keep the device command ledger inside the driver; it supplies evidence to admission but cannot independently make a durable device claim available.

**Device admission** is the new bridge authorization to operate a canonical device; it is distinct from the glossary's **Device lease**. The existing Device lease invariant, “Once released, nothing the run started can still act on the device,” is not weakened or redefined. Admission adds an independent durable refusal condition; it never instructs a driver to release an otherwise unreleasable lease. Host eligibility and visible evidence are not a new proof of native release.

1. **Before effects:** persist a claim and immutable intent before boot, install, launch, capture, app stop, or UI input on the chosen simulator. Offline validation/config reads may precede admission. Inventory-wide read-only listing is allowed before a particular device is chosen. Allocation must obtain the same claim before operating on its choice.
2. **One owner:** atomic acquisition grants at most one owner for a canonical device. A competing request gets busy without modifying the incumbent. There is no check-journal-then-take-lease authorization gap.
3. **No accidental release:** PID death, age, cancellation, polling, process exit, a screenshot and an action acknowledgment never turn an uncertain claim available. Quarantine is monotonic; no automatic clear, replay or device reuse.
4. **Authority is transactional:** the attempt terminal and device disposition commit together. A file named `result.json`, an event, or a fulfilled evidence callback is not a terminal outcome.
5. **Read is read:** status and result queries never transition admission state or call a device backend. An active claim remains busy even if its process appears dead.
6. **Owner fencing:** all transitions compare an unguessable claim token and generation. A stale owner/late callback cannot change a new owner or overwrite a terminal. A handle stops accepting commands synchronously when cancellation/finalization starts.
7. **Evidence meaning:** observed completion establishes visible predicates only. Host process exit and this admission protocol do not establish native contact consumption, settlement or release. No app instrumentation is introduced.
8. **Isolation scope:** enforcement covers updated bridge processes using one OS user and admission root. Other users, older binaries, direct MobileBuildMCP/AXe, Simulator interaction and unrelated tools remain outside enforcement.

## Diagnosed facts

| Source | Inspectable behavior and implication |
| --- | --- |
| `src/experimental/observed-journal.ts:69–84` | Both `deviceStatus` and `read` write quarantine when encountering a live claim/unfinished intent. Read-only polling can sabotage a healthy attempt. |
| `src/experimental/observed-journal.ts:86–130` | A competing claim creates quarantine. Completion publishes a completed result before claim unlink and directory sync; a subsequent failure attempts quarantine, but `read` returns the completed result first. |
| `src/device/lease.ts:116–144` | DeviceLease uses uppercased identity and reclaims a dead-PID lease. It never consults observed quarantine. |
| `src/device/index.ts:537–583` | iOS preparation takes that lease then launches; it assumes a dead iOS holder requires no sweep. All updated iOS preparations must obtain durable admission here or present a validated pre-acquired handle. |
| `src/experimental/observed-tap.ts:60–113` | Intent precedes preparation, but bounded cancellation may return while the underlying promise continues. Inconclusive execution skips finish. Evidence result precedes journal finalization. |
| `src/device/index.ts:519–535,831–870` | `issueCommand` checks the run signal before issuance but uses a separate deadline signal afterward. `close` can arrange late cleanup/release. Neither is a native settlement witness. |
| `src/scripted/run.ts:519–550` | Legacy cleanup precedes verdict/report; a cleanup failure changes the verdict to inconclusive. Preserve frozen meanings while making durable admission survive cleanup. |
| `src/experimental/observed-run.ts:28–58`; `src/device/index.ts:287–297` | Experimental storage is per-user Application Support; leases are temporary. Public UUID parsing and driver selection uppercase, but the journal itself hashes raw identity. |

Applied codebase-design to locate the shared seam. Applied diagnosing-bugs with a host-only feedback loop; fix/regression phases are explicitly deferred because this ticket authorizes planning only. No temporary product instrumentation was added.

The following minimal command was run against the actual modules in an isolated temporary directory and exited 0 in 0.17 seconds. Assertions intentionally detect the present defects; implementation regression tests invert the unsafe-acquisition expectation and require active completion to succeed after reads. A real child creates the stale lease and exits, avoiding a guessed dead PID.

```sh
node --import tsx --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ObservedActionJournal } from './src/experimental/observed-journal.ts';
import { DeviceLease } from './src/device/lease.ts';
const root = await mkdtemp(join(tmpdir(), 'admission-audit-'));
try {
 const journalRoot = join(root, 'journal');
 const leaseRoot = join(root, 'leases');
 const device = '00000000-0000-4000-8000-000000000001';
 const journal = new ObservedActionJournal(journalRoot);
 const a = await journal.begin({deviceId:device, actionId:'lost', intent:{}});
 await a.uncertain('lost reply');
 const child = spawnSync(process.execPath, ['--import','tsx','--input-type=module','-e',
  `import {DeviceLease} from './src/device/lease.ts'; await new DeviceLease({root:process.argv[1]}).take(process.argv[2]);`,
  leaseRoot, device], {encoding:'utf8'});
 assert.equal(child.status, 0);
 const legacy = new DeviceLease({root:leaseRoot});
 const reclaimed = await legacy.take(device);
 assert.equal(legacy.held, true);
 assert.equal(typeof reclaimed?.processId, 'number');
 assert.equal(await journal.deviceStatus(device), 'quarantined');
 console.log('REPRODUCED: legacy acquired quarantined device after dead-PID reclaim');
 await legacy.release();
 for (const method of ['read','deviceStatus']) {
  const d = `${device}-${method}`;
  const active = await journal.begin({deviceId:d, actionId:'active', intent:{}});
  if (method === 'read') await journal.read(d,'active'); else await journal.deviceStatus(d);
  await assert.rejects(active.complete({status:'outcome_observed'}), /quarantined/);
  console.log(`REPRODUCED: ${method} changed healthy active claim so completion rejects`);
 }
} finally { await rm(root,{recursive:true,force:true}); }
NODE
```

Observed output:

```text
REPRODUCED: legacy acquired quarantined device after dead-PID reclaim
REPRODUCED: read changed healthy active claim so completion rejects
REPRODUCED: deviceStatus changed healthy active claim so completion rejects
```

These reproduce separate mechanisms: independent stores permit legacy bypass; observation itself mutates quarantine. Cancellation and finalization race findings remain source inspection and require injected-fault tests below. No causal claim is made from a hypothetical live run.

## Storage and identity

Choose a transactional SQLite adapter behind the admission module rather than extending the two independent multi-file protocols. Store at `~/Library/Application Support/jev-ios-bridge/admission/admission.sqlite`, with a canonical, private, local directory (0700) and database/journal files (0600). Production root is resolved once from the OS account's home, independent of cwd, evidence folder, supplied action and worktree. No public per-request root override. Tests inject an isolated store together with a fake backend; a real backend must reject test-store configuration. Refuse unsafe/mismatched roots, schema versions, corruption and unreadable state; never fall back to an empty in-memory store or a new cwd-relative root.

Use the tuple `('ios-simulator', uppercaseUUID)` as the canonical key. Validate UUID syntax before hashing/storage. Names, `booted`, casing variants and paths cannot create alternative device keys. Store the canonical identity in every record. Android retains its existing device identity/lease rules in this iteration; namespacing prevents cross-platform collisions.

`node:sqlite` and `DatabaseSync` are documented in Node **24.0.0**, the declared package minimum. That version labels the module **Stability 1.1, active development**, so this is an explicit runtime dependency on an evolving built-in, not a claim that it is stable. Restrict the adapter to 24.0.0 methods (`exec`, `prepare`, `get`, `run`, `close`) and test the minimum version in CI. The local smoke check succeeded on Node v26.8.1 with a real BEGIN IMMEDIATE/COMMIT transaction; this does not substitute for the minimum-version gate. [Node 24.0.0 documentation](https://nodejs.org/download/release/v24.0.0/docs/api/sqlite.html).

Use short `BEGIN IMMEDIATE` transactions, rollback-journal `DELETE` mode, `synchronous=EXTRA`, `fullfsync=ON` on macOS, foreign keys and a bounded busy timeout (at most 250 ms per attempt). Keep device calls and awaited operations outside transactions. SQLite serializes writers; a busy transaction fails closed/retries only admission acquisition within the original request deadline, never device input. Read one consistent snapshot. `EXTRA` includes the directory synchronization needed for journal deletion in DELETE mode. This choice assumes a functioning local filesystem and its documented sync behavior; storage failure is not a release witness. [SQLite transactions](https://sqlite.org/lang_transaction.html), [SQLite synchronous settings](https://sqlite.org/pragma.html#pragma_synchronous).

Minimum logical records:

- store metadata: schema version, root identity and one-time migration manifest;
- device: canonical key, state, generation, owner token, owner run, PID/process-start diagnostic, quarantine reason;
- attempt: globally unique observed action identity (legacy uses its run identity in a separate kind namespace), immutable request digest, bound device, owner token/generation, state, outcome/reason and evidence references;
- append-only diagnostic transitions, including late acknowledgments; these cannot authorize admission.

Global observed identity prevents accidentally admitting the same action identity on a fresh replacement device. Same identity plus changed input is rejected; same identity plus identical input is retrieval only. No automatic retry, including after allocation ambiguity. This guarantee is scoped to the declared action identity: the bridge cannot recognize the same business operation deliberately renamed under a new identity. Allocation identity is separate; a provisioning claim may precede a known UDID and must bind once through the lifecycle contract, without authorizing device effects before device admission. The public-contract designer owns naming and exposure of this identity; allocator owns its pre-device reservation, then binds it exactly once.

## Interface and ownership

Suggested internal interface, not a frozen public contract:

```ts
interface Admission {
  acquire(request: AdmissionRequest): Promise<Claim | AdmissionRefusal>;
  inspect(device: CanonicalDevice): Promise<DeviceStatus>;
  readAttempt(identity: AttemptIdentity): Promise<AttemptView | undefined>;
  quarantineAbandoned(expected: OwnerIdentity, reason: string): Promise<void>;
}
interface Claim {
  readonly identity: OwnerIdentity; // device, run, token, generation
  bindDriver(): AdmittedDriverSession; // nontransferable; one driver attachment
  finalize(candidate: TerminalCandidate): Promise<AuthoritativeTerminal>;
}
```

`bindDriver` is a module-owned capability, never a request-provided token string. The driver construction path must require this capability or acquire one itself for legacy preparation. Allocation passes the existing capability through boot/install/prepare rather than reacquiring. Returning `Claim` means its transaction committed and all required compatibility checks succeeded. Do not expose a generic `release()` or `markAvailable()` to the runner.

Admission transaction checks migration/schema, quarantine, existing owner and duplicate attempt before inserting the new intent and setting device active. Constraints enforce uniqueness. A busy competitor leaves incumbent bytes/semantic state unchanged. Preparation obtains the legacy compatibility lease only after the new claim is durable, and returns no usable handle until both are held. If a compatibility lease already names a live older process, return busy without device calls; if it is dead, malformed or uncertain, retain/quarantine the new claim, without dead-PID reclaim for iOS. Initial legacy compatibility refusal before any effect may finish a refused attempt without making an old unknown lease safe.

The updated iOS path must not rely on `DeviceLease.take`'s dead-holder recovery. Keep the legacy lease file as best-effort exclusion of old *live* processes and as the command ledger's local hold. Shared-store authority remains mandatory for every updated iOS backend dispatch. Its release never deletes durable quarantine. A compatibility lease can be released during confirmed cleanup while the new store remains active; a failed terminal commit therefore still blocks updated successors. Atomicity here is across updated bridge participants, not uncooperative old writers.

## State transitions

| Starting state | Event | Durable result / allowed effect |
| --- | --- | --- |
| available | successful atomic acquire | active + immutable admitted attempt; then preparation may start |
| active | competing acquire or any read | busy/current view; no writes and zero competitor backend calls |
| active, own handle | known pre-effect refusal/cancellation | terminal refused + available in one transaction, only if no operation can still issue work |
| active, own handle | observed success/already-satisfied or completed legacy run; all host operations and required cleanup settled | terminal outcome + available in one transaction; no native certification |
| active, own handle | uncertain command/preparation/capture/evidence/cleanup; cancel with outstanding work | terminal inconclusive + quarantined in one transaction |
| active, frontend/process lost | ordinary read/new request | active/orphan-suspected and unavailable; never reclaimed |
| active, abandoned owner | explicit recovery with expected token/generation | terminal inconclusive + quarantined; never available |
| quarantined | any new action, late completion, cleanup, age/PID change | remains quarantined; refuse action; diagnostics may append |
| terminal attempt | same identity repeated | immutable retrieval or conflict if input differs; zero device calls |

`quarantineAbandoned` is explicit startup/operator recovery, separated from status. It may only move an expected active owner toward quarantine. A restart must not presume every active claim belongs to the restarting process; preserve live independent owners. Use recorded process incarnation as diagnostic evidence; uncertain liveness means keep busy. Recovery never authorizes device effects. Crash before admission COMMIT produces no permission and no device calls; crash after COMMIT leaves an active durable claim even if no input was sent.

Observed success can release host admission only after all driver operations settle and cleanup is confirmed; it still carries the existing visible-evidence limitation. An inconclusive observation remains quarantined even if all host processes later exit. If the lifecycle contract retires successful dedicated inventory as single-use, that stronger inventory policy sits above available host admission.

## Cancellation, finalization and readers

Unify the caller cancellation signal and per-command deadline. Closing the session first revokes future command issuance, then best-effort aborts work already dispatched. Every backend command, including preparation and app stop, must be entered in the command ledger before dispatch. Track the underlying promise, not just its abortable wrapper; a wrapper rejecting does not settle the actual work. Recheck the session gate immediately before each dispatch, so a resumed async continuation cannot launch or tap after cancellation. Exactly one tap may be dispatched for the attempt; neither timeout nor fresh-device allocation permits replay.

Uncertain cancellation commits inconclusive/quarantined with a separate bounded local-finalization budget. After uncertainty, do not dispatch app stop or further device commands as cleanup; local child/process teardown is allowed. A late acknowledgment updates diagnostics only. Existing `releaseLate` must not call device cleanup or durable release after a session is quarantined. If legacy cleanup is still required before uncertainty is decided, keep active ownership until it settles; if it does not, quarantine and stop further dispatch.

Serialize finalization against cancellation/late callbacks through one claim state machine. Before a successful terminal commit, disable dispatch, await all tracked operations and the necessary host cleanup, persist evidence payloads, validate owner token/generation, and verify there is no uncertainty. In one database transaction write the exact terminal payload, freeze the attempt and set device available or quarantined. No fallible lease deletion/evidence publication after this transaction is allowed to be a prerequisite for claiming the committed terminal: do required cleanup first; subsequent export/report rendering is a projection.

If evidence writes fail before the terminal, finalize inconclusive and quarantine. If COMMIT returns an error/ambiguous reply, the caller must not emit success from the candidate; return finalization-unconfirmed, disable the handle and attempt a fresh authoritative read. If the transaction is not durably established, the old active record keeps admission closed; explicitly quarantine when the store recovers. If the exact complete transaction is later verified, retrieval may report that committed terminal with a lost-response diagnostic. This is retrieval, never a second action. If state cannot be verified (I/O failure, missing database, corruption), all affected admission and success resolution fails closed.

MCP, CLI, watch, report and experimental wrapper all call the same `readAttempt` resolver. Missing/active/unreadable records are never success. Imported old results with an unfinished claim or quarantine are inconclusive regardless of `completed` in their result file. Existing provisional files remain labeled non-authoritative. Once a new transaction commits, an exported JSON file can be rebuilt from it; an export failure must be reported separately from the authoritative observed outcome. A historical committed success remains a historical fact if a *later different* attempt quarantines the device; retrieval returns current device disposition separately and never treats historical success as current admission permission.

## Migration and coexistence

Migration is a required offline maintenance step before enabling new real-device entry points. Stop old bridge/experimental writers operationally; their protocol has no fence that an importer can enforce. Acquire a migration guard honored by all updated processes, inspect/import old journals and lease records, commit the manifest and imported state, then enable updated entry points. If quiescence cannot be established, refuse activation. Do not claim that comparing mtimes or a new guard prevents old writers racing import.

Enumerate existing old journal records rather than guessing one uppercase hash. Parse recorded identities, canonicalize valid UUIDs and merge aliases conservatively. Preserve every quarantine, active/unfinished attempt, malformed conflicting record and retained legacy claim; uncertainty dominates apparent completion. Import replay history as well as unavailable devices. Never delete or rewrite source journals/claims. Ambiguous/unattributable corruption fails migration closed rather than silently omitting it. A dead old lease is not evidence of safe native release.

Default historical journal root is known. Non-default experimental journal roots cannot be discovered reliably; operators must declare them in the migration manifest, or keep affected devices excluded. Preserve all retained study/live device exclusions. A fresh inventory supply does not justify resetting old state. Backup/restore must preserve the whole admission store; deleting the root or restoring an older snapshot invalidates admission guarantees, so no automatic “repair by recreate.” First-time initialization is distinct from a missing/corrupt initialized store; persist and validate an installation marker outside the database before enabling devices, and treat an existing marker with missing DB as unavailable.

Older 1.x binaries consult only legacy lease files and may reclaim after process death. An active compatibility lease reduces overlap while its process is alive, but it cannot make durable quarantine enforceable to those binaries. Require exclusive updated-bridge operation of dedicated devices; no simultaneous old experimental writer or external operator. Do not fake a permanent live PID, kill unrelated tools, delete old claims, add a new device transport, or describe advisory files as an OS/native fence.

ADR-0005 does not freeze lock location or driver interface. Keep script/report/verdict/exit-code meanings and existing contract tests; legacy admission refusal uses existing device-busy/error handling, with additional detail rather than a reinterpreted pass. ADR-0002/0007 device-transport permissions are unchanged. Proposed new ADR text: “All updated iOS bridge effects require durable shared admission; transactional attempt finalization and monotonic quarantine are authoritative; Node's built-in SQLite is an internal runtime dependency; older binaries and external tools require operational exclusivity.” The coordinator owns the actual ADR/spec edits.

## Implementation regression matrix

Exercise the shared interface through real updated public/driver paths with fake backends plus real independent subprocesses and temporary durable stores. Use barriers/fault hooks at storage and dispatch seams; do not substitute mock acquire for the behavior under test.

| Case | Required observable verdict |
| --- | --- |
| observed vs legacy simultaneous acquisition, both orderings; same/different action identities | exactly one effect-capable owner, loser sends zero backend calls; incumbent remains completable |
| lower/upper UUID; MCP vs CLI vs independent cwd/worktree | same canonical claim; root/identity alias cannot bypass |
| real child dies after committed admission/uncertainty, then new legacy preparation | busy/quarantined; zero launch/capture/stop/tap; no dead-PID release |
| repeated polling of a healthy active run | no logical/file mutation by admission reads; active owner completes normally |
| cancel before admission, after admission, during prepare, immediately before tap, during tap/poll, during cleanup | zero dispatch after gate closure; at most one tap; uncertain stages remain quarantined |
| underlying promise ignores abort and resolves late | no late follow-up command, result promotion, cleanup dispatch or quarantine removal |
| result candidate says success; evidence/transaction failure before commit | no success from every reader; prior active or quarantine blocks successors |
| subprocess killed at each transaction milestone | committed state is all-or-nothing; no terminal-success-plus-unfinished-claim split; no replay |
| COMMIT ambiguity / response lost after commit | fresh resolver yields exact committed terminal or unavailable; no repeated action |
| storage read-only/full/corrupt/missing; unknown schema; missing initialized DB | zero backend calls, no alternate-root/in-memory fallback and no inferred success |
| stale token/generation, duplicated finalize, late callback after new owner | cannot mutate current claim; exact repeated terminal retrieval is harmless |
| migration case aliases, quarantine+completed, unfinished intent, dead/malformed lease, old writer not quiescent | all uncertainty preserved; activation refused where import cannot be safe |
| action identity repeated on a new device / changed payload | retrieval/conflict only; zero backend calls |
| device A quarantined, independent B available | B can acquire under normal admission; no implicit retry of A's business action |
| old-version live/dead lease fixtures | live best-effort exclusion shown; dead-version bypass limitation explicitly documented, not claimed fixed |
| legacy golden contracts + Android lease tests | frozen report/verdict meanings unchanged; Android fencing behavior preserved |
| Node 24.0.0 and supported CI versions, packaging import | module loads and transactions work without new flags; active-development dependency recorded |

Required implementation write area: new `src/device/admission.ts` (and internal SQLite adapter if separation helps), iOS driver integration, observed journal/run/tap adaptation, service/reader adapters assigned by the public-contract owner, and dedicated admission/migration/cancellation tests. One implementation owner owns admission plus terminal resolution; coordinate every shared driver/service edit. No product files are changed by this decision.

Remaining acceptance work: implement and run this fault matrix; validate Node minimum; exercise the eventual public interface in the live matrix on fresh owned simulators; conduct independent safety review. These are implementation gates, not unanswered design questions. Migration's old-writer quiescence and external exclusive operation are operational prerequisites that software cannot prove through the present transport. No native release certification is available or promised.
