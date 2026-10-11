# External storage option: /Volumes/Sam

Source review and read-only host inspection on2026-10-11. The owner subsequently said “go ahead” to this route. Root is coordinating bounded setup and candidate selection; individual source-removal paths still require a concrete verified-copy plan before dispatch.

## Supported configuration

`JEV_RUNS_DIR` selects the evidence root for both public CLI and MCP (`src/cli.ts:80,199`). Allocation staging lives under that root (`src/observed/allocation.ts:175`). A dedicated absolute canonical directory on Sam can host it if the filesystem preserves owner/private permissions and artifact links. The evidence root must be owner-owned0700; ancestors must be real directories without symlinks. Xcode generic builds can use explicit fresh `-derivedDataPath` locations on Sam, with explicit resulting app paths and preserved manifests.

## Remaining internal requirement

`allocationStorage` still measures the fixed OS-account `Library/Developer/CoreSimulator` path (`src/observed/allocation-config.ts:496`). Production creation and command guards expose no custom device-set option. Setting `JEV_RUNS_DIR` does not relocate simulator data.

Under the unchanged five-case plan, separate volumes need60GiB free on the simulator volume and70GiB free on staging, plus build headroom. At the last accepted15.31GiB internal measurement, moving future outputs alone leaves44.69GiB internal shortfall. A new actual measurement supersedes this historical number.

Recommended route: confirm Sam filesystem/capacity, use it for future builds/staging, and identify suitable existing internal files for a separately scoped verified relocation to recover internal capacity. Preserve stores, evidence, protected devices, unknown-create guards and accepted product. Do not relocate CoreSimulator by symlink or change HOME. Custom external simulator storage would be a separately designed product/backend change with new review.

## Observed Sam facts

Root parsed and audited the retained raw diskutil plist and receipt. Sam is a distinct external writable Journaled HFS+ volume with136,483,442,688bytes (127.11GiB) available. Internal simulator free space is now21,806,772,224bytes (20.31GiB), leaving42,617,737,216bytes (39.69GiB) below the60GiB simulator requirement. No files were moved or written on Sam.

`GlobalPermissionsEnabled:false` reports ownership enforcement disabled. The private evidence/staging suitability gate is therefore not accepted. Resolve that setup with a bounded policy before staging; do not silently alter the whole volume. Offloading approximately40GiB would leave about87GiB externally before build/staging consumption, but reclaimable space and actual resulting capacity need fresh proof. [Root audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-sam-volume-audit.json).

## Authorized continuation

The owner approved proceeding with Sam setup and suitable-file relocation. Independent setup review recommends enabling ownership on the freshly identified exact Sam volume, then creating one private release subtree. An APFS image on an ownership-ignored backing filesystem would not fix backing-file isolation. The operator must retain volume identity before/after, require ownership enforcement, create only the absent dedicated workspace, inspect permissions/ACLs and stop on variance. No recursive permission changes or repartitioning.

First bounded inventory completed: Downloads0.65GiB, Desktop0.26GiB, Movies negligible, DerivedData0, caches10.18GiB and project workspaces17.37GiB. These totals do not identify enough safe relocation candidates. A second metadata-only aggregate inventory is authorized; no source removals have occurred.

## Ownership attempt result

The independently reviewed ownership-only script made one noninteractive sudo attempt. It exited1 with `sudo: a password is required`, observed direct-child close04:59:22.767Z, complete output and no timeout/kill. No ownership success is claimed; no Sam namespace, relocation or source removal occurred. The owner has been asked to run the same command in their local Terminal. After that, the sole operator must freshly verify exact volume identity and ownership before separate root-permission/private-directory setup. [Attempt audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-sam-ownership-attempt-audit.json).

## Owner-completed administrator steps

The owner reported the ownership command complete. Fresh operator inspection confirmed the same VolumeUUID48570675-F94C-3532-89D3-B005FDCF8334 with ownership enabled. It exposed the stored Sam-root identity as root:wheel0775, noACL; the earlier501:20 observation reflected ignored ownership. The proposed owner501 mount-root chmod is therefore not applicable and was never run. Root accepts the root/wheel ancestor; no volume-root mode change is needed.

The owner then reported completion of exact nonrecursive mkdir0700 and chown501:20 for `/Volumes/Sam/jev-ios-bridge-release-2026-10-11`. The operator must verify this private namespace before creating build/staging/archive children. [Ownership audit](../observed-integration/acceptance/host/live-resume-2026-10-11/root-sam-owner-recheck-audit.json). No archive copies or source removals have occurred.
