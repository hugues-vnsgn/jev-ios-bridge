# Ticket06 bounded repair matrix

Original candidate c751a73df7931107af23619c350d2ca406ac55db; only service.ts / observed-service.test.ts and own ticket Comments change.
Public boundary: ObservedActionService start/cancel/inspect/close; accepted isolated Admission with explicit fake runner/opener. No live devices or production stores.

| Case / oracle | Inputs | Expected surfaces | Evidence |
|---|---|---|---|
| P1 / independent Spec reproduction; H05/H06/H08 cancellation fencing | Pending capture, isolated DB temporarily hidden, explicit cancel | Synchronous local gate revoke; STORE_UNAVAILABLE; zero late capture/input; no invented durable marker; unresolved/null authority if begin-finalization unavailable | p1-red-node26.log; affected/final runs |
| P2 / independent Spec reproduction; separate action and5000ms finalization budget, H03/H06 |500ms action deadline; valid observation before deadline; confirmed650ms close | committed already_satisfied; false input flags;1observation; complete export; close <5000ms | p2-red-node26.log; affected/final runs |
| P2 local cancel during close and provisional / H06/H08 | close/provisional held650ms; failed durable cancel write | markerfalse before release; committed CANCELLED/quarantined; markertrue only from verified accepted03 jointfinalize; one capture/no input | local-finalization-original-red.log; affected/final runs |
| P3 / public-contract103/allocation105, independent Spec probe; H01/H07 | Unknown created identity blocks unrelated parked action | refusal names BLOCKER allocation and its exact persisted absolute directory; no attachment; requested allocation binding/ready state and global guard/capacity/DBbytes unchanged | p3-red-node26.log; affected/final runs |
| P3 cannot prove pointer / H01/H07 | Borrowed read capability throws,missing,relative,wrongidentity,notblocking | STORE_UNAVAILABLE; no fabricated/requested-action evidence pointer; no input/binding/state/capacity/DB mutation | affected/final runs |
| Existing cancellation / H05/H06/H08 | local/external cancel and deadline during pending input; late receipt | null crash flags/quarantine/identical lease; no replay/promotion | existing input-pending tests, affected/final runs |
| Existing finalization / H03/H06/H08 | before/after commit fault,closeerror/closepending,provisional externalcancel,shutdown ordering | committed authority wins only freshread; uncertainty conservative; local close still bounded5000ms; allowned gates close before await | affected/final runs |
| Existing strict runtime / H01/H03/H05/H06/H07/H08 | Full06focused including migration43 preserved | strict binding,readsbyteinvariance,oneinput,retained exclusion,evidence/export authority,disabled approvedflag | final focused26/24,fullcheck,coverage |

Original logs/manifests/probes copied before edits. `boundaries-node26.log` had8/10 due incorrect terminal markerfalse expectation; classified fixture assertion error. The accepted claim records cancellation locally despite a failed cancelwrite and legitimately commits it during jointfinalize. Strict corrected oracle asserts false BEFORE release and true only AFTER committed finalize. This is not product red/green evidence.
Original local-finalization reproduction passes close case and fails provisional case (unconfirmed rather than committed CANCELLED); both remain permanent strict cases.

`affected-node26.log` first expanded run24/25: one historical fake allocator refusal named a nonexistent blocker. Strong verified-pointer contract correctly returned STORE_UNAVAILABLE; fixture was upgraded to persist an actual unknowncreator guard and assert its exact directory as well as original zeroattachment/retrieved invariants. Case count preserved. This is fixture compatibility, not a remaining product defect.
