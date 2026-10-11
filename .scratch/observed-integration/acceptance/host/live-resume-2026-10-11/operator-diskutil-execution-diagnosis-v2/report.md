# Bounded diskutil execution-context diagnosis

{
  "status": "ELEVATED_QUERY_READONLY_MOUNT_CONFIRMED",
  "diagnosticCalls": 1,
  "compatibilityCalls": 0,
  "compatibility": "UNVERIFIED",
  "argv": [
    "/usr/sbin/diskutil",
    "info",
    "-plist",
    "/Library/Developer/CoreSimulator/Volumes/iOS_22G86"
  ],
  "parsed": {
    "MountPoint": "/Library/Developer/CoreSimulator/Volumes/iOS_22G86",
    "Writable": false,
    "WritableMedia": false,
    "WritableVolume": false
  },
  "parseError": null,
  "childExitCode": 0,
  "childSignal": null,
  "actualClose": "2026-10-11T02:44:15.459Z",
  "timedOut": false,
  "overflow": false,
  "captureComplete": true,
  "priorChild0134": {
    "exitCode": 1,
    "stdoutBytes": 0,
    "stderrBytes": 203,
    "stderrSha256": "2374e28f61a1ab9e76bbc1f72178ff880d59c566fea05511ad2cf8c2d52567f6"
  },
  "comparison": {
    "argvEqual": true,
    "environmentEqual": true,
    "shellFalseUnchanged": true,
    "originalFailureStderrEqual": false,
    "freshExitSuccessful": true,
    "freshStdoutBytes": 3092,
    "freshStderrBytes": 0
  },
  "evidencePreserved": true,
  "parserPath": "dist/observed/installed-plist.js",
  "parserSha256": "bfa578bac5fe8b3a1101ea945b8db8f0f54bccf29c9ab4de0122831d0162df5f",
  "permissionScope": "A require_escalated tool execution was requested. The tool result is the authority for actual elevation approval; no permission-profile or credential value was inspected.",
  "finding": "The same exact read-only query succeeds in the elevated execution context, while child0134 failed under default workspace-write. This isolates execution context as relevant; the specific sandbox/framework/IPC rule is not identified. Fresh typed read-only mount fields are confirmed only for this single query.",
  "operatorState": "IDLE_FOR_ROOT_AUDIT"
}

Only failed child0134 and the pinned production parser were consumed as comparison inputs. Raw outputs, argv, exact minimal environment, exits, signals, timeout/overflow handling and actual close are adjacent. No compatibility rerun, native follow-up, host/runtime/account/device mutation, SDK/network/app build, migration or live case. The diagnostic does not pass production compatibility. Operator idle.
