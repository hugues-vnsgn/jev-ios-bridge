Exact-directory operational setup repair: REPAIR_VERIFIED

{
  "scope": "One owner-authorized setup repair of exact app-owned directory only",
  "target": "/Users/hugues_mini/Library/Application Support/jev-ios-bridge",
  "startedAtUtc": "2026-10-11T03:02:13.160Z",
  "outerEnvironmentNames": [
    "DEVELOPER_DIR",
    "HOME",
    "LANG",
    "LC_ALL",
    "PATH",
    "__CF_USER_TEXT_ENCODING"
  ],
  "operations": [
    {
      "method": "lstat",
      "path": "/Users/hugues_mini/Library/Application Support/jev-ios-bridge",
      "bigint": true,
      "atUtc": "2026-10-11T03:02:13.160Z"
    },
    {
      "method": "open",
      "path": "/Users/hugues_mini/Library/Application Support/jev-ios-bridge",
      "flags": 1048832,
      "fd": 11,
      "atUtc": "2026-10-11T03:02:13.160Z"
    },
    {
      "method": "fchmod",
      "via": "held FileHandle.chmod",
      "fd": 11,
      "permissions": "0700",
      "atUtc": "2026-10-11T03:02:13.160Z"
    },
    {
      "method": "close",
      "completed": true,
      "atUtc": "2026-10-11T03:02:13.160Z"
    }
  ],
  "fchmodCalls": 1,
  "actualHandleClose": {
    "atUtc": "2026-10-11T03:02:13.160Z",
    "completed": true
  },
  "status": "REPAIR_VERIFIED",
  "claimsContentOrGuardMutation": false,
  "beforePath": {
    "dev": "16777233",
    "ino": "132696181",
    "uid": "501",
    "gid": "20",
    "mode": "16877",
    "size": "128",
    "nlink": "4",
    "mtimeNs": "1791421214902501564",
    "ctimeNs": "1791421214902501564",
    "type": "directory",
    "permissions": "0755"
  },
  "openFlags": {
    "O_RDONLY": 0,
    "O_DIRECTORY": 1048576,
    "O_NOFOLLOW": 256,
    "combined": 1048832
  },
  "beforeDescriptor": {
    "dev": "16777233",
    "ino": "132696181",
    "uid": "501",
    "gid": "20",
    "mode": "16877",
    "size": "128",
    "nlink": "4",
    "mtimeNs": "1791421214902501564",
    "ctimeNs": "1791421214902501564",
    "type": "directory",
    "permissions": "0755"
  },
  "freshPathBeforeChange": {
    "dev": "16777233",
    "ino": "132696181",
    "uid": "501",
    "gid": "20",
    "mode": "16877",
    "size": "128",
    "nlink": "4",
    "mtimeNs": "1791421214902501564",
    "ctimeNs": "1791421214902501564",
    "type": "directory",
    "permissions": "0755"
  },
  "beforeBindingVerified": true,
  "afterDescriptor": {
    "dev": "16777233",
    "ino": "132696181",
    "uid": "501",
    "gid": "20",
    "mode": "16832",
    "size": "128",
    "nlink": "4",
    "mtimeNs": "1791421214902501564",
    "ctimeNs": "1791687733160465579",
    "type": "directory",
    "permissions": "0700"
  },
  "afterPath": {
    "dev": "16777233",
    "ino": "132696181",
    "uid": "501",
    "gid": "20",
    "mode": "16832",
    "size": "128",
    "nlink": "4",
    "mtimeNs": "1791421214902501564",
    "ctimeNs": "1791687733160465579",
    "type": "directory",
    "permissions": "0700"
  },
  "afterBindingVerified": true,
  "completedAtUtc": "2026-10-11T03:02:13.160Z",
  "allowedChange": "Only exact target permissions0755 to0700, one fchmod through held descriptor. No parent/Xcode/runtime/recursive chmod, content/claim/guard change, configuration read or migration."
}
