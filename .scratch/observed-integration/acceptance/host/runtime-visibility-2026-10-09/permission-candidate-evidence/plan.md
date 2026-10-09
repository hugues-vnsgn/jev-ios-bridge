# Installed Xcode path policy repair

Root-reviewed scope: exact base4004ece782fc9448607605bfe3a54702f8622bb0; owner decision in integration operator evidence permits trusting local administrators only for canonical /Applications as the ancestor of fixed /Applications/Xcode.app. Source write set: allocation-config.ts and its existing tests only. Root owns integration, documentation and independent review. No live host compatibility claim.

The agreed interfaces under test are verifyInstalledCompatibility and production allocationSourceProcess with injected filesystem/process adapters. Existing private mapped allocation fixture owns all synthetic host paths and isolated durable fixture state. No actual installed-host paths or system metadata are inspected.

Diagnosis phases1/2 already established the first production cutoff and finite ancestor findings. Ranked hypotheses: (1) strict group-write rejection causes this reported cutoff; expected root0/gid80/0775 regression fails before repair and passes afterward. (2) accepting /Applications broadly would admit paths beyond Xcode; expected alternate artifact path remains refused. (3) fresh final leaf stats can bypass strict owner/write/symlink checks; expected injected fresh leaf changes refuse before any child.

Steps: preserve base/source; install locked tooling if required; write and capture the narrow positive red before policy edit; write/capture fresh-leaf red before that edit; retain all assertions; add bounded negative and ordering regressions; run affected test file, typecheck and build sequentially on Node26.8.1/exact24.0.0; freeze exact sources; focused commit; return evidence for Root independent review. Full/coverage gates await Root serialized grant.

| Scenario | Input | Expected | Interfaces | Evidence source |
| --- | --- | --- | --- | --- |
| Reported cutoff | /Applications root0/admin80/exact0775, strict Xcode descendants | Compatibility succeeds, exact permitted process calls succeed | Both | New regression, genuine pre-fix red |
| Normal strict path | Fixture's original owner-only ancestors | Existing compatibility/process success | Both | Existing tests |
| Exception negatives | Wrong uid/gid, extra mode bits, symlink, file type | Refusal, no child/create | Both | New matrix |
| Descendant and unrelated ancestor unsafe | Xcode directory/leaf, Library, usr or alternate .app parent | Refusal, no child/create | Both | New matrix |
| Fresh final leaf changes | Owner/write/symlink/type differs at final lstat | Refusal, no child/create | Both | New regression, genuine pre-fix red |
| Metadata unchanged protections | Replacement/hardlink/oversize/mutation | Refusal | Compatibility/process | Existing and new tests |
| Ancestor change noticed | Exception becomes unsafe between metadata phases | Refusal, no create; no later child | Both | New ordering regression |
| Trusted ancestor identity changes | Exception retains allowed policy with different inode | Permitted under owner trust decision; no atomic identity promise | Compatibility | New explicit limit regression |
| Runtime/command/environment compatibility | Exact IDs, supported roots, minimum runtime, fixed args/options/env | Existing behavior preserved | Both | Existing tests and focused gate |

Cook/TDD/do-test use the reviewed plan and owner-authorized seams. Shared tracker, domain docs and journal are Root-owned and untouched. Author validation is not independent review. Real runtime exposure, native behavior, L01-L05, full suite and coverage remain unverified in this slice.
