# 12 — Audit implementation and determine merge readiness

Type: task
Status: ready-for-agent
Mode: AFK
Blocked by: 11
Owner: Independent safety reviewer; Root owns final merge-ready verdict
Model: gpt-6-astra
Effort: high
Skills: code-review, do-test, codebase-design
Expected commit: `review: record observed workflow safety acceptance`

## Dispatch contract and context

Read [the handoff](../../observed-integration/implementation-plan.md), [specification](../spec.md) and [validation matrix](../../observed-integration/evidence/validation-matrix.md). Root supplies the full pinned planning base SHA, final integrated SHA, dependency/evidence commits and isolated review workspace. Reviewer must have authored no implementation. Read the accepted decisions when auditing their invariants; their meaning stays authoritative. Review starts on Root’s explicit ticket dispatch with the pinned base and satisfied dependencies; merge remains Root-owned.

## Write ownership

Allowed writes: `.scratch/observed-integration/acceptance/safety-review.md`; this issue's Status/Comments. Reviewer may run isolated host checks and inspect evidence read-only. All product files, other acceptance artifacts, maps/specs, target apps, store/device claims, source journals and common handoff protected files remain protected. Root alone owns source repairs, evidence reruns, integration and final readiness.

## Bounded work and acceptance

Review the base-to-integrated diff and every H01–H09/L01–L05 evidence row. Audit the production shared authority, no-adapter lifecycle, global immutable identities, migration/marker fail-closed behavior, cross-process dispatch/cancel ordering, guarded creation and capacity, parked transfer/normal shutdown, late-owner fencing, truthful null flags, atomic outcome/disposition and postcommit export projection. Verify legacy/Android meanings and installed Node 24.0.0 behavior remain supported. Inspect exact live counts, unchanged source/app hashes, visible outcomes, synthetic-loss wording and residual native/external limitations. Distinguish implementation correctness from unsupported guarantees.

Acceptance: safety-review.md records inspected SHAs, findings by severity with file/evidence anchors, reproducible checks, every gate's PASS/FAIL/UNVERIFIED, and a clear merge-ready recommendation. Missing proof stays UNVERIFIED; confirmed defects block readiness. Reviewer reports findings to Root without editing implementation. Root fixes and reruns affected gates, then sends a new integrated SHA for a bounded re-review; the reviewer updates only this report.

## Return and final gate

Return the handoff's fixed-format report with review commit, inspected base/integrated SHAs, evidence links, checks, limitations and unresolved findings. Root issues merge-ready only when H01–H09, L01–L05 and independent review all PASS. Stop for an authorship conflict, unreviewable evidence, contradictory contract or missing prerequisites. No automatic merge, version bump, release or publish follows a PASS.

## Comments
