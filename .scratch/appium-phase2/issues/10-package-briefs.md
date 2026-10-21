# Phase 2 package briefs

Type: grilling
Status: resolved
Claimed by: Claude Code (main agent; taken over from the owner session at the owner's request, 2026-10-19)
Labels: wayfinder:grilling
Mode: HITL
Parent: [Appium Phase 2 decision map](../map.md)
Blocked by: none

## Question

How is Phase 2 split into bounded implementer briefs for 2A through 2D, with token caps, stop rules, order and verification lists?

## Required investigation or discussion

Graduated from the map's fog; this is the map's destination. Use the [roadmap](../../appium-mcp-migration/roadmap.md) packages (2A configuration and preflight, 2B canonical identity and offline migration, 2C authoritative lifecycle, 2D exclusion and recovery tests) and the Phase 2 specification's sections. Decide: package boundaries against the decided sections (profiles, identity, store schema evolution, legacy lease import, release state, lease retirement), dependency order, a token cap and stop rule per brief (as in Phase 1), the race tests H01 to H03, H11, P3 and P4 owned by 2C/2D, the per-command write-cost measurement, and the one live check for adb device-side process matching.

Input from [Activation runbook for the real store](09-activation-runbook.md): package 2B also builds the read-only `admission-maintenance preflight`, makes `upgrade` and `import` repeat its checks, and writes the runbook text and the public guide update. It does not apply them to the real store.

## Completion criterion

Record the actual owner decision (or sourced answer for research), unresolved
limits, and the exact changes required in the Phase 2 specification.

## Answer

Owner decision, 2026-10-19: the [Phase 2 build plan](../plan.md) is approved as written ("go ahead").

- Nine PRs split by file ownership, not four roadmap packages, because 2A, 2B and 2C all write `src/device/admission.ts` and `src/device/admission-sqlite.ts`. P2.1 write-cost bench, P2.2 named profiles, P2.3 identity pair and schema 3, P2.4 live identity and preflight, P2.5 legacy import and activation tooling, P2.6 authority lifecycle, P2.7 race and recovery suite, P2.8 DeviceLease retirement, P2.9 exit.
- Schema 3 holds every Phase 2 record type, including recovery claims and the maintenance journal, so 2C needs no schema 4.
- Order and parallel pairs, token caps (111M total) and stop rules are in the plan's Spawn owners block. Race tests H01 to H03, H11, P3 and P4 are P2.7. The per-command write cost is measured by P2.1 on trunk and P2.9 at the head. The adb device-side process match is P2.8's live check.
- Execution follows hStack autopilot-stack. Two Codex workers own the PRs, the main agent verifies and stacks them, and the owner lands the stack bottom-up. P2.2, P2.4 and P2.5 are review-gated.
- Live lanes run only through the fake-store observed-host harness, because the production store ignores HOME.

Open limits: the profile budget upper bounds are proposed in P2.2 for the owner's approval. The plan's caps are estimates; an overrun stops the owner and comes back to the main agent.

## Comments

- 2026-10-19, owner session: a parallel grilling of this ticket in the owner's wayfinder session reached a four-package split (2A to 2D, with 2A and 2B in parallel). The owner then chose this ticket's nine-PR build plan instead. The four-package split would have had two workers editing `src/device/admission.ts` and `admission-sqlite.ts` at once, and the plan already covers that session's extra rules: the real store is never touched (fake-store harness only), a 20 ms p95 limit on write cost, and the adb live check. No briefs were written from that session.
