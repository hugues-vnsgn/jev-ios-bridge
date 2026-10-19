# Complete owned-automation coverage

Date: 2026-10-14
Research base: `2f9ba8d4b1ddd6318662605cf1ec04208fde2c41`
Ticket: **Complete owned-automation coverage**
Disposition: sourced planning answer; implementation and native acceptance remain open

## Answer and scope

Use a durable, monotonic record of process incarnations and observed parent-child edges, captured before parents disappear, together with separate evidence for device-native automation. Finish cleanup with exactly one bounded, read-only host inventory. Treat current parent, group, session and private-command-marker matches as discovery evidence; preserve saved identities across reparenting. Require an explicit completeness argument for each launch path. A final scan with no matches cannot establish that argument. This recommendation follows the escape and reparenting semantics below and ADR-0011's requirement to verify every owned component's loss of ability to act. [OS-1], [OS-2], [R-1]

For arbitrary uncooperative native grandchildren, the frozen shim plus process scans cannot prove complete coverage. Accept only launch paths whose spawning is covered by durable registration or a verified OS event mechanism; retain quarantine for uncovered paths or observer gaps. Polling can discover descendants but cannot rule out a fork, escape and parent exit between samples. This is an inference from the shim's direct-parent check and the OS semantics, not a measured guarantee. [R-2], [R-3], [OS-1], [OS-2]

This turn searched Hindsight first; its Appium migration page contained no findings. Research then read committed sources, saved receipts, public SDK headers and first-party documentation. It ran no host process fixtures, native cases, device commands, Jev calls or migrations. The report makes no native GO judgment. The existing phase record already identifies the untested verifier and open gate 3. [R-7]

## Known facts at the frozen point

| Finding | Evidence and limit |
|---|---|
| The Node shim wraps `spawn`, `spawnSync`, `execFile`, `execFileSync`, `exec` and `execSync`; `fork` is refused. | It substitutes a Python launcher in that Node process. It does not instrument forks performed inside the intended native executable. [R-2] |
| The launcher persists identity before executing the intended executable. | It requires `getppid() == owner.pid`, records PID, PPID, PGID, incarnation, owner identity, executable/argument hashes and a command ID, and fsyncs the receipt and directory. It samples closure and rechecks owner incarnation before exec. It has no grandchild registration or atomic close-versus-exec barrier. [R-3] |
| Direct-child stopping covers recorded incarnations, including children that changed groups. | It rechecks incarnation before PID signals. However, its helper returns `None` on every short/failed Darwin identity read, and stopping treats an unequal result as absence. That conflates failed inspection with demonstrated disappearance. [R-4], [R-5], [OS-4] |
| The descendant verifier is a draft with one `ps` invocation. | It combines live roots, recursive PPID matches, the owner's numeric PGID, sessions of live matching roots, saved candidates and private command markers. Snapshot mode sets `verified=true` after parsing even when candidate incarnations are unavailable. Verify mode can match saved `(pid, None)` pairs. Neither proves complete historical ancestry. [R-6] |
| The final scanner has an incomplete time bound. | Its 20-second timeout covers `ps`, while receipt loading, identity reads and graph processing sit outside that subprocess deadline. Some file/schema assertions happen before its error-receipt handler. [R-6] |
| Cleanup does not call the descendant verifier. | Current `live-protocol-client.mjs` records a provisional automation fence from group stop, direct-child stop and native automation cleanup. Its final predicate has no complete-descendant condition. [R-8] |
| Saved normal receipts establish narrower facts. | The iOS receipt contains 23 direct-child records and the Android receipt 47; each reports recorded children stopped and native automation inert. Both omit descendant verification, and both saved clients retain quarantine with `leaseReleased=false`. Their frozen client hash differs from the current client. [E-1], [E-2] |
| The owner's final audit is explicitly limited. | It records 1,158 checked identities, no recorded survivors, one completed scan and no scoped matches, with `gate3Proven=false` and `sharedServicesStopped=false`. It does not reconstruct lost ancestry. [E-3] |

Repository links in this report refer to the research base above. The normal-case source records preserve the source bytes and hashes used for their respective receipts. They omit the verifier, so those cases cannot qualify the draft. [E-1], [E-2]

## What scans cannot prove

**PPID is a current relationship.** Apple's `_exit(2)` documents reparenting of surviving children when their parent exits. A previously recorded incarnation remains useful afterward; a fresh PPID traversal cannot recover the lost edge. Double-forking can remove both intermediate ancestors before a sample. [OS-2]

**Groups and sessions are not permanent ancestry.** `setsid()` creates a new session and process group. Node's pinned documentation says detached non-Windows children become leaders of a new group/session and that children can survive parent exit. A saved group or session match can discover candidates, but it cannot cover an escaped descendant that was never recorded. A numeric group alone also carries no process-incarnation check. [OS-1], [R-5], [R-6]

**Command markers are leads, not ownership authorization.** The draft searches private device identifiers, set path, serial and ports in rendered command strings. It hashes those strings rather than preserving arguments. Such matches can identify suspicious work, but absence proves only that these markers were not visible in this inventory. A marker can disappear on exec; another process can mention the same port or private path without being owned automation. `ps` supplies current process information rather than a history of launches. The false-positive and false-negative conclusions are inferences from that interface and the draft. [R-6], [OS-5]

**A missing identity is not an absent process.** Darwin `proc_pidinfo()` returns zero when its underlying request fails. The frozen helper collapses that and all short reads to `None`. Preserve API status and error detail, and distinguish absent, present, changed incarnation and inspection unknown. Treat `(pid, None)` as unknown, never a durable identity. [R-5], [OS-4]

**One inventory is not an atomic history.** The draft first collects `ps` rows and then reads each process's incarnation. A PID may change between those operations. Bind ancestry and state to a validated incarnation or mark the row uncertain; do not infer parent identity from a PID number alone. The pinned Node documentation also warns that reused PIDs can receive signals intended for an exited child. [R-6], [OS-1]

**An empty inventory cannot settle device-native work.** UiAutomator2's pinned driver catches session-deletion and port-removal failures and continues cleanup. XCUITest documents WDA reuse and attachment independently of the current Appium session. Host ancestry therefore needs a separate device automation fence, including unknown creation without a returned session ID. A successful delete reply and closed ports alone cannot satisfy ADR-0011. [APP-1], [APP-2], [R-1]

**Automatic kqueue child tracking is unavailable here.** The installed public macOS SDK says `NOTE_TRACK`, `NOTE_TRACKERR` and `NOTE_CHILD` are unsupported since 10.5; it also says a `NOTE_FORK` event does not pass the child PID through to the actual kevent. Do not propose those flags as a complete macOS descendant recorder. [OS-6]

**Endpoint Security is a possible separate research path.** Apple exposes [fork events](https://developer.apple.com/documentation/endpointsecurity/es_event_fork_t) and [per-client/per-event sequence numbers](https://developer.apple.com/documentation/endpointsecurity/es_message_t/seq_num) to detect dropped messages, but requires an [entitlement requested from Apple](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.endpoint-security.client). It is not a capability established for this frozen stack. Adding such a dependency would require its own availability, startup coverage, identity and event-loss proof before it could supply a completeness argument.

## Proposed evidence and unknown rules

The following are recommended requirements, not claims about existing behavior. They implement ADR-0011 within the limits just described. [R-1], [R-7]

1. **Declare the coverage boundary before dispatch.** Pin OS/API layout, stack and source hashes, device identity, owned artifacts, permitted launch paths, owned ports and exclusions. For every native executable, state how its descendants are registered, observed without gaps, or constrained so an unsupported fork cannot occur. Source inspection alone must remain an assumption until the native acceptance evidence qualifies that path. [R-3], [R-7], [OS-6]
2. **Record identities monotonically.** Persist `(host boot identity, pid, start incarnation)` plus parent incarnation, run/command authorization, observation method and order before permitting actionable work. Preserve historical edges when PPID, group, session or executable changes. Fsync failures, missing registrations and observer loss set coverage unknown. Registration must cover every descendant depth, not just the Node launch boundary. [R-3], [R-5], [OS-2]
3. **Keep discovery separate from stop authority.** A PPID/session/marker candidate without trustworthy ownership is unresolved. Signal only attested automation after revalidating its incarnation, device scope and exclusions. Retain quarantine for an unresolved candidate; a marker match must never authorize killing another tool's process. [R-4], [R-6], [OS-1]
4. **Classify shared services explicitly.** ADB's host server manages multiple clients and devices, and can be started by a client. Its launch ancestry is therefore insufficient to make it disposable automation. Record shared ADB/CoreSimulator services as exclusions even if discovered under a launch root, and fence owned device automation and queued work separately. Prohibit broad group signals that would include an excluded service; stop eligible members individually or retain quarantine. Existing group-stop code has no such per-member exclusion. [APP-3], [R-5], [R-7]
5. **Close and drain dispatch before final verification.** Persist closure, account for every authorized launch and command, stop attested host automation, and establish the separate native fence. A launcher that passed its closure check just before closure must remain accounted for until its execution or refusal is known. Neither a sampled closed flag nor stopping a parent rules out later work from an existing child. [R-3], [OS-1], [R-1]
6. **Run one post-stop verification.** Invoke exactly one read-only host inventory after owned cleanup. Give the entire operation a single monotonic deadline, proposed at 20 seconds pending host reliability review. Bound receipt sizes, process rows and output; validate untruncated output and process identities. Compare all saved incarnations, discover PPID/group/session/marker candidates, and verify exclusions without signalling them. If the bound is exceeded, write an unknown receipt without another automatic scan. [R-6], [R-7]
7. **Persist an auditable result.** Record source/stack hashes, coverage method and gaps, closure order, scan start/end/deadline and count, inspection errors, exact identity outcomes, candidates and ownership dispositions, excluded services, host-stop and native-fence receipt hashes, and unresolved components. Keep command evidence limited to hashes and named marker categories; omit secrets and full command lines. Write failures as evidence too. [R-3], [R-6], [R-8]
8. **Require every release condition independently.** Permit an experimental release-predicate record only when dispatch is durably closed, all issued commands are terminal or fenced, host coverage is complete, all attested actionable host incarnations are absent/inert, the native fence is verified and no unresolved candidate remains. Missing/malformed evidence, permission errors, deadline expiry, observer loss, ambiguous attribution and unsupported launch paths retain quarantine. Safe cleanup leaves the uncertain action inconclusive. [R-1]

The single final inventory verifies the saved coverage boundary at its recorded time. It does not supply historical completeness. A complete boundary must also account for restarters, authorized launches still in flight and work delegated to shared services; otherwise the result remains unknown even with an empty candidate list. [R-1], [OS-1], [APP-3]

## Host test scenarios to specify

These fixtures are future work. Use no device layer, real ADB/CoreSimulator services, Jev, production admission store or production lease. Use temporary owner-only receipts, fake marker values and independent sentinel processes. Drive timing with barriers rather than delays; inject PID/incarnation errors deterministically where reuse is impractical. Each fixture must inspect the final evidence and assert one post-stop inventory, quarantine/release-predicate behavior and preservation of the sentinel. These requirements follow the roadmap and the failure modes above. [R-7], [R-6]

| Scenario | Precise setup and required outcome |
|---|---|
| Registered direct child | Hold child at a barrier after registration; close dispatch, stop it, verify its exact identity absent. Complete host coverage may pass only with all other fake fence conditions supplied. |
| Registered grandchild | Child spawns a registered grandchild; parent exits before cleanup. The saved parent-incarnation edge survives and cleanup accounts for the grandchild. |
| Group escape | Registered grandchild changes PGID while its parent stays alive. It remains tracked independently of the owner group. |
| Session escape and reparenting | Registered grandchild calls `setsid()`, parent exits, grandchild execs a marker-free helper. Its saved incarnation remains discoverable and prevents a pass while active. |
| Unobserved double fork | A permitted native launcher double-forks before a snapshot; survivor changes session and has no marker. Without a supported registration/event guarantee, coverage must be unknown even if final candidates are empty. This is the required negative control. |
| Parent lost before capture | Kill the launcher at a barrier before ancestry registration. A later empty scan must retain the registration gap. |
| Launch races closure | Hold an authorized child between its last closure check and exec; close dispatch, then release it. Closure must account for its disposition before the final predicate; no late actionable child may escape accounting. |
| Marker-only candidate | Independent sentinel contains an exact fake marker or owned-port token. Record unresolved attribution, retain quarantine and send no signal. A proven foreign classification may clear that candidate only with supporting evidence. |
| Marker boundary cases | Use a longer serial, UUID prefix, unrelated path substring and port embedded in another number; ensure they do not establish ownership. Exact matches still remain discovery evidence. |
| Changed PID incarnation | Supply a saved PID with incarnation A and current incarnation B. Record A absent only after successful inspection; never signal B or inherit A's ancestry edges onto B. |
| Identity read fails | Inject API failure, short result and denied inspection for both root and candidate. Every case writes inspection unknown; no `(pid, None)` identity or absence inference passes. |
| Inventory is inconsistent | Inject PID replacement between enumeration and identity read, duplicate rows, parse failure, missing command data and truncated output. Refuse coherent ancestry proof and retain quarantine. |
| Observer/register failure | Inject missing registration, failed fsync, observer restart or event loss. A subsequent empty scan must not erase the gap. |
| Whole-operation deadline | Delay receipt loading, enumeration, identity inspection and graph work separately. Every expiry returns a durable unknown result within the specified bound; automatic inventory count remains one. |
| Excluded shared service | Fake shared-service sentinel is a recorded descendant in the same group. Cleanup must preserve it and refuse indiscriminate group kill; unknown shared work keeps quarantine. |
| Zombie and respawner | A confirmed zombie cannot itself execute, but its registered child or restarter still blocks completion. Replacing an old incarnation with a new owned automation instance must add coverage obligations. |
| Result integration | Supply successful delete, group stop and direct-child stop with descendant unknown, or complete host evidence with native fence missing. Neither records the full predicate. Force receipt-write failure and assert quarantine. |

## Recommended phase-spec constraints

Apply these changes to **Phase 1 feasibility** when assembling the handoff; this report does not edit that specification. The roadmap already orders component verification before the final native matrix. [R-7]

- Define complete host coverage separately from a successful snapshot and from native inertness. Replace the draft's overloaded `verified` flag with explicit inspection, coverage and component-disposition results. [R-6], [R-1]
- Require the host scenarios above, including the unobserved double-fork negative control. Specify that an empty inventory cannot clear an unresolved launch path or observer gap. [OS-1], [OS-2], [R-7]
- Require one bounded post-stop verification in every cleanup path, including setup failure and cancellation. Pin a whole-operation deadline and receipt format; prohibit hidden retries and broadening signals to shared/foreign services. [R-6], [R-7]
- Gate the provisional journal record and final case status on that evidence as well as the existing closure, command and native-fence conditions. Freeze corrected source before qualifying cases. Historical `releasePredicateRecorded` flags remain mechanism evidence. [R-8], [R-1], [R-7]
- Keep implementation, host proof, native matrix and reviewed GO as separate milestones. This report resolves the research question's evidence rules; it leaves the feasibility gate open. [R-7]

## Outstanding native proof and decisions

1. Select and prove the completeness mechanism for every native launch path in the frozen stack. A polling implementation alone cannot support arbitrary escaped grandchildren. Decide whether uncovered paths remain quarantined or justify an OS observer dependency. [R-2], [R-3], [OS-6], [OS-7]
2. Prove device-native automation identity and loss of ability to act on both private platforms, including creation loss without a returned session ID, queued work in shared services, restart prevention and settled input. The current scoped cleanup receipts cannot supply the missing host ancestry guarantee. [R-1], [E-1], [E-2]
3. Establish safe exclusion of shared ADB/CoreSimulator services in actual launch topology; determine whether any owned launch can place such a service in a group currently stopped wholesale. This report finds that risk in the mechanism, not evidence that it occurred. [R-5], [APP-3]
4. Qualify the deadline and identity API behavior on the intended OS/SDK. Pin boot/incarnation semantics and classify read failures without treating them as disappearance. [R-5], [OS-3], [OS-4]
5. Finish the corrected six-case matrix on each private platform, one case at a time after source freeze, then obtain a reviewed GO/NO-GO report. Existing owner-stop evidence and passing controls cannot replace missing cases. [R-7], [E-3]

## Sources and pins

**Repository sources:** all paths below are committed at the research base. The source-record files cited under E-1/E-2 embed the historical bytes; use them when assessing those cases rather than current experiment files.

| Key | Source and SHA-256 where the draft mechanism matters |
|---|---|
| R-1 | [ADR-0011](../../../docs/adr/0011-shared-admission-and-evidenced-native-fencing.md) |
| R-2 | [Node receipt shim](../candidate-stack/experiments/native-process-receipts.mjs), `dd90ef26e91e4a6aa4f68dd340f4545f6d1cc5eb08176f2702f7976384eba60e` |
| R-3 | [Pre-exec launcher](../candidate-stack/experiments/native-process-exec.py), `c0a73bf91966a1e2cdc93f3d3d761d5ac56b263a22c38f71d2596f8d288d89f5` |
| R-4 | [Direct-child stopping](../candidate-stack/experiments/stop-native-children.py), `16059c1986b2fe1ef63c8a0faba8ff15d6a4772b0518b0ebf7f922e4c18a2e9c` |
| R-5 | [Identity and group stopping](../candidate-stack/experiments/stop-group.py), `9e1a3650bdcd7493cb301e58e719bee6fb9b17d2305e205f992e0260112f1e38` |
| R-6 | [Verifier draft](../candidate-stack/experiments/verify-native-descendants.py), `8a86b3018430ebb6992758a118e903a62c454467f2241896cac5df6072da10c1` |
| R-7 | [Phase record](../phase-1.md), [roadmap Phase 1](../roadmap.md#phase-1-prove-operation-and-safe-stopping) |
| R-8 | [Current cleanup client](../candidate-stack/experiments/live-protocol-client.mjs), `3e4f96eba4268120afaf442d9af602576111f21984687248d458b0eab64313d6` |
| E-1 | iOS normal case: [source record](../evidence/live-protocol/proof-ios-normal-20261013/source-record.json), [stop receipt](../evidence/live-protocol/proof-ios-normal-20261013/automation-stop.json), [client](../evidence/live-protocol/proof-ios-normal-20261013/client.json) |
| E-2 | Android normal case: [source record](../evidence/live-protocol/proof-android-normal-20261013/source-record.json), [stop receipt](../evidence/live-protocol/proof-android-normal-20261013/automation-stop.json), [client](../evidence/live-protocol/proof-android-normal-20261013/client.json) |
| E-3 | [Owner-stop host audit](../evidence/owner-stop-20261013/host-audit.json) |

**First-party external sources:** consulted 2026-10-14. Appium tags below match versions in the [frozen stack record](../evidence/protocol/stack.json); that record pins archives and measured loaded-file hashes, not every future native launch.

| Key | Primary source |
|---|---|
| OS-1 | [Node v26.8.1 child_process: detached and kill](https://nodejs.org/download/release/v26.8.1/docs/api/child_process.html), [Apple setsid(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/setsid.2.html) |
| OS-2 | [Apple _exit(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/_exit.2.html) |
| OS-3 | Local Xcode SDK [proc_info.h](/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/include/sys/proc_info.h): `pbi_pid`, `pbi_ppid`, `pbi_pgid`, start seconds/microseconds; SHA-256 `e427fa96b348537b21552b9de71e01039410bcad2cedee5584c5e5fddafd70fc`. [libproc.h](/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/include/libproc.h): public inventory/identity declarations; SHA-256 `246d87709fc6b9157ce5cf3c475656ac48e0e1ae8bbdc46cf45acd34294448cd`. These files were read, not executed. |
| OS-4 | [Apple libproc source, proc_pidinfo](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.c); current first-party source, not a claim about the installed kernel revision |
| OS-5 | [Apple ps manual source](https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/ps.1); current first-party interface reference |
| OS-6 | Local Xcode SDK [sys/event.h](/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/include/sys/event.h), lines 248 to 255 and 356 to 362; SHA-256 `435ed8fe99ae70c19404c3da14be6e2d217686ac256aed3b5df721b353dbb350` |
| OS-7 | Apple [fork event](https://developer.apple.com/documentation/endpointsecurity/es_event_fork_t), [sequence number](https://developer.apple.com/documentation/endpointsecurity/es_message_t/seq_num), [entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.endpoint-security.client). Their first-party documentation JSON was read at `developer.apple.com/tutorials/data/documentation/` using the respective document paths plus `.json`. |
| APP-1 | [UiAutomator2 v8.7.0 driver, deleteSession](https://github.com/appium/appium-uiautomator2-driver/blob/v8.7.0/lib/driver.ts) |
| APP-2 | [XCUITest v12.17.1 capabilities](https://github.com/appium/appium-xcuitest-driver/blob/v12.17.1/docs/reference/capabilities.md) |
| APP-3 | [Android Developers: ADB architecture and operation](https://developer.android.com/tools/adb#howadbworks) |

[R-1]: ../../../docs/adr/0011-shared-admission-and-evidenced-native-fencing.md
[R-2]: ../candidate-stack/experiments/native-process-receipts.mjs
[R-3]: ../candidate-stack/experiments/native-process-exec.py
[R-4]: ../candidate-stack/experiments/stop-native-children.py
[R-5]: ../candidate-stack/experiments/stop-group.py
[R-6]: ../candidate-stack/experiments/verify-native-descendants.py
[R-7]: ../phase-1.md
[R-8]: ../candidate-stack/experiments/live-protocol-client.mjs
[E-1]: ../evidence/live-protocol/proof-ios-normal-20261013/source-record.json
[E-2]: ../evidence/live-protocol/proof-android-normal-20261013/source-record.json
[E-3]: ../evidence/owner-stop-20261013/host-audit.json
[OS-1]: https://nodejs.org/download/release/v26.8.1/docs/api/child_process.html
[OS-2]: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/_exit.2.html
[OS-3]: /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/include/sys/proc_info.h
[OS-4]: https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/wrappers/libproc/libproc.c
[OS-5]: https://github.com/apple-oss-distributions/adv_cmds/blob/main/ps/ps.1
[OS-6]: /Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk/usr/include/sys/event.h
[OS-7]: https://developer.apple.com/documentation/endpointsecurity
[APP-1]: https://github.com/appium/appium-uiautomator2-driver/blob/v8.7.0/lib/driver.ts
[APP-2]: https://github.com/appium/appium-xcuitest-driver/blob/v12.17.1/docs/reference/capabilities.md
[APP-3]: https://developer.android.com/tools/adb#howadbworks
