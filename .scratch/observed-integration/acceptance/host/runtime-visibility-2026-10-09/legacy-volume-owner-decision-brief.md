# Legacy mount decision ready for owner review

Status: owner approved the exact proposal below. [Frozen approval](owner-legacy-mount-trust-decision.json). Root dispatched the isolated author for implementation and verification; all implementation/native/live gates remain pending.

## Why a separate decision is needed

The approved Cryptex v3 policy preserved strict checks on older CoreSimulator Volumes. The once actual compatibility lookup now stops there: root/admin-owned0775 directories are rejected even though the two observed mounts report read-only status. This is a new policy scope; the earlier approval does not cover it.

## Concrete proposal

Approve only [legacy-volume-policy-proposal-v3.md](legacy-volume-policy-proposal-v3.md), SHA256 `14dd5566f99845a4ee6562404c16610c732795f311b7df1e95ecb306dd599492`.

- Fixed `/Library/Developer/CoreSimulator/Volumes/iOS_<bounded-build-name>` namespace; strict root-owned ancestors above the mount.
- Fresh exact MountPoint and three typed false Writable fields before/after every runtime listing/conversion; stable namespace, complete candidate set, identities and bytes.
- Mounted root-owned metadata with the stated groups/modes only; lossless identity comparisons or refusal, including supplied timestamp precision.
- Existing explicit runtime-ID matching and every enumeration/process/cancellation budget; no fallback or skipping older mounts.
- Existing strict branches and approved Applications/Cryptex meanings preserved. No host permission or mount changes.

Stable missing Volumes is a presence state distinct from an empty directory and preserves default/Cryptex behavior. Appearance/disappearance before return refuses. Manual snapshots are diagnostic facts, not authorization for future reads.

## Review and evidence

| Gate | Result |
| --- | --- |
| Prior repaired product | Both exact Node defaults1999/1999, typecheck/build, both37-command npm/plugin proofs and wrapped startup PASS |
| Actual compatibility | Once REFUSED/exit3 at old Profiles0775; Cryptex not reached |
| Separate manual diagnosis | Exactly two successful closed diskutil children; exact typed read-only mount responses, observed mounted modes fit |
| Root native-evidence audit |4185checks,27private files; three system inode observations explicitly qualified |
| Final independent Spec proposal review | PASS0findings; [report](legacy-volume-policy-review/spec/revision3/report.md) |
| Final independent Standards/design proposal review | PASS0findings; [report](legacy-volume-policy-review/standards/revision3/report.md) |
| Root sealed review audit |87outputs rehashed unchanged; [audit](root-legacy-volume-review-audit.json) |

Earlier Spec FAILs remain preserved: revision1 required stable enumeration/candidate binding; revision2 required lossless identities. Both requirements are now explicit. Unsafe Node-number inode observations for `/usr`, `/usr/sbin` and diskutil remain uncertain; original exact integers cannot be recovered. No new native probe repaired that evidence, and no atomic ancestry/ACL certificate is claimed.

## Work following approval

The [prepared execution plan](../../../../observed-action-rollout/legacy-volume-repair-plan.md) requires genuine failing regressions, the bounded private implementation, both exact Node default gates and independent implementation reviews. Root integration and fresh installed proofs follow. The same sole GPT-6.1-Sol xhigh operator then performs one new pinned actual compatibility lookup before operational entry, five serial live cases and independent ticket12 review.

All migrations, app builds, device actions, L01–L05 and ticket12 remain unstarted. Owner approval here authorizes the bounded policy repair and verification, not a claim that those gates have passed. No merge, push or publication is included.
