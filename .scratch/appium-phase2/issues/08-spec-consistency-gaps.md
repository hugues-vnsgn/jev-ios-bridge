# Spec consistency gaps

Type: grilling
Status: resolved
Claimed by: Claude Code (main agent, owner session)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: 06

## Question

After tickets 01 to 06 each wrote into the Phase 2 specification, where do its
sections contradict each other or stay silent, so that a builder of 2A to 2D
would have to make a decision?

## Answer

Owner decision, 2026-10-19: all ten recommended answers accepted as one batch.
The gaps came from a read-only cross-check of `origin/feat/appium-phase2` at
`5adb686c0`, excluding Legacy lease import and the activation runbook, which
were open in another session. Each answer is written into the specification
section named.

1. **Recovery claim** (Recovery at admission; 2C/2D). One durable, exclusive
   recovery claim per target generation. Only its holder issues sweep commands,
   each recorded; a competitor causes no device effect; ordinary admission waits
   until the claim closes with its receipt accepted.
2. **Settled MobileBuildMCP work** (Stop evidence in Phase 2; 2C). A settled
   one-shot command confirmed complete is terminal evidence for its component.
   Persistent components still need stop evidence; uncertain commands stay
   unreleasable.
3. **Upgrade recovery record** (Interrupted upgrades; 2B). Recorded as its own
   immutable maintenance event in a journal that exists at both versions, linked
   to the guard token and any committed step receipt; the step receipt is never
   edited.
4. **Fresh stores** (Fresh and test stores; 2B). Fresh initialization is a
   separate single-transaction mode reusing each step's changes and keeping the
   original migration receipt; backup and `upgrades` receipt rules apply only to
   upgrading an existing store.
5. **`observed` outcome** (Separate records; 2B/2C). Kept as a fourth immutable
   attempt outcome with its v1.4.0 meaning and stored values.
6. **Budget fields** (Budgets; 2A). `startupMs`, `operationMs`, `cleanupMs` with
   explicit defaults and bounds, compared field by field; `maxSteps`,
   `wallTimeMs` and `handbackTimeoutMs` stay independent limits.
7. **One identity, several transports** (Identity; 2A). Refuses
   `DEVICE_AMBIGUOUS` unless an explicit serial selects one; instances share the
   admission key.
8. **Release refusal order** (Release; 2C/2D). `STALE_OWNER`, `UNBOUND_PROOF`,
   `NOT_COVERABLE`, `DISPATCH_OPEN`, `COVERAGE_UNKNOWN`, `COMMANDS_UNFENCED`,
   `COVERAGE_INCOMPLETE`; the first failing check names the code.
9. **Identity refusal vocabulary** (Resolution; 2A). `DEVICE_IDENTITY_UNAVAILABLE`
   with one reason from `NONDEFAULT_DEVICE_SET`, `EMULATOR_VERSION_UNSUPPORTED`,
   `REMOTE_CONSOLE`, `MALFORMED_PROVENANCE`, `PROVENANCE_INACCESSIBLE`,
   `PROBE_TIMEOUT`; `DEVICE_IDENTITY_CONFLICT` stays for disagreeing sources.
10. **Reused PIDs** (Verification and exit, lease retirement; 2D). A reused
    owner PID proves the old owner gone and permits recovery; a reused component
    PID never authorizes a stop, and release refuses without independent proof.

Open limits: the exact default and bound values for the three budget fields are
chosen in the 2A brief and written into the profile schema there. The ten items
are what one cross-check found, not a proof that no other gap exists.
