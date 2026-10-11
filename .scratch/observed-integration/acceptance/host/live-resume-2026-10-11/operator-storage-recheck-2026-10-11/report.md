# Fresh production storage proof

Status: **STORAGE_UNAVAILABLE**. One fresh call to the unchanged production `allocationStorage` returned valid free-space values; the unchanged conservative five-case storage requirements refuse entry. No build command preparation or execution followed this refusal.

| Path scope | Available bytes | Required bytes | Shortfall bytes |
| --- | ---: | ---: | ---: |
| Simulator | 16436826112 | 64424509440 | 47987683328 |
| Staging | 16436826112 | 75161927680 | 58725101568 |

Both paths have 15.30798721 GiB available. The existing 20 GiB floor remains unchanged; simulator requires 60 GiB and staging 70 GiB, before additional build margin. The requirements use the previously accepted zero reserved bytes, five 8 GiB reservations and five 2 GiB staged artifacts. Capacity/authority and configuration were not freshly read in this dispatch. Free space is a point-in-time estimate, not a quota or a reservation; external consumption remains unfenced. Production per-preparation checks remain enabled.

Simulator path: `/Users/hugues_mini/Library/Developer/CoreSimulator`. Staging path: `/Users/hugues_mini/orca/workspaces/jev-ios-bridge/feat-native-callback-diagnostic/.scratch/observed-integration/acceptance/live/entry-2026-10-11-v2`. Evidence uses a new private directory without changing either storage-query path or sealed entry artifacts.

Effective digest: `0ef4ca5a076024284eef7594e40dc638ee7be61dcc69b99fca1aff3249ded77d`. All 13 accepted limits equal the pinned production defaults. Both raw numeric StatFs return objects were captured and returned unchanged; all recorded fields are safe integers. Exact once helper budget: 1; exact statfs paths: 2, in production order.

Production read interval: 2026-10-11T03:31:58.295Z through 2026-10-11T03:31:58.296Z; duration 0.201791 ms. Direct recording child actual close: 2026-10-11T03:31:58.299Z; exit 3, signal null. Exit 3 represents the expected storage refusal, not a helper filesystem exception or an approval rejection. The tool also returned exit 3. Only the direct child close is observed; descendants are unobserved. Captures are complete; stderr is empty; no timeout, output overflow, stop request or kill occurred.

The exact outer supported `require_escalated` request and actual tool return are retained. The recording child has `shell:false`, a 10-second deadline, 64 KiB combined-output limit and SIGTERM then 250 ms SIGKILL policy, unused. Child argv/environment, raw stdout/stderr and spawn/exit/close events are in `storage-receipt.json` and raw `.bin` files. No key was loaded. Prepared recorder syntax checks only; no new product tests or compilation.

Finite `/opt/homebrew/bin/git rev-parse HEAD` returned `7482f2a4d31de989117f039de142ef16bb428466`, exit 0 without diagnostic output. Root's committed prior evidence adds no product change. Before and after hashes match all 443 Source, 69 compiled and 15 original host references against root-adr-review-correction/root-audit.json (SHA `23788f5e88242d5ef6c6d333f4edef8a6be3c4705c96c793cfc07b0bf8f67458`). The previous entry manifest SHA `5938a8a11b832bbf27e733607a5635982550e518345897652869efee9c2cc02d` and all 56 sealed files remain unchanged. Original failure, migration, compatibility and attribution evidence was not overwritten or rerun.

No migration, authority read, compatibility probe, reservation, device operation, cleanup, budget change, download, build, merge, push or publication ran. The next authorized checkpoint remains storage and Root review before any build. Operator is idle for Root audit.

`artifact-hashes.json` seals every file in this new directory except the manifest itself; files 0600 and directory 0700.
