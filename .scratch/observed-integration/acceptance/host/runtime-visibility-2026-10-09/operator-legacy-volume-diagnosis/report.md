# Bounded manual legacy-volume metadata diagnosis

{
  "status": "COMPLETE_TWO_MOUNT_DIAGNOSIS",
  "uncertainty": null,
  "nativeChildren": 2,
  "perRootQueryCounts": {
    "/Library/Developer/CoreSimulator/Volumes/iOS_22G86": 1,
    "/Library/Developer/CoreSimulator/Volumes/iOS_23E254a": 1
  },
  "mountProofs": [
    {
      "root": "/Library/Developer/CoreSimulator/Volumes/iOS_22G86",
      "readOnlyConclusion": "EXACT_MOUNT_REPORTS_UNWRITABLE",
      "proof": {
        "MountPoint": "/Library/Developer/CoreSimulator/Volumes/iOS_22G86",
        "Writable": false,
        "WritableMedia": false,
        "WritableVolume": false
      },
      "queryStable": true,
      "runtimeListingStable": true,
      "runtimeEntries": 1,
      "runtimeBundleBasenames": [
        "iOS 18.6.simruntime"
      ],
      "bundleIdentityStability": [
        {
          "basename": "iOS 18.6.simruntime",
          "stable": true
        }
      ]
    },
    {
      "root": "/Library/Developer/CoreSimulator/Volumes/iOS_23E254a",
      "readOnlyConclusion": "EXACT_MOUNT_REPORTS_UNWRITABLE",
      "proof": {
        "MountPoint": "/Library/Developer/CoreSimulator/Volumes/iOS_23E254a",
        "Writable": false,
        "WritableMedia": false,
        "WritableVolume": false
      },
      "queryStable": true,
      "runtimeListingStable": true,
      "runtimeEntries": 1,
      "runtimeBundleBasenames": [
        "iOS 26.4.simruntime"
      ],
      "bundleIdentityStability": [
        {
          "basename": "iOS 26.4.simruntime",
          "stable": true
        }
      ]
    }
  ],
  "exitCode": 0,
  "signal": null,
  "allChildrenClosed": true,
  "allRawOutputsComplete": true,
  "allChildrenExit0": true,
  "lstatEvents": 210,
  "runtimeFileOpenCount": 0,
  "plutilCount": 0,
  "compatibilityLookupCount": 0,
  "preservationBefore": true,
  "preservationAfter": true,
  "preservationCounts": {
    "source441": 441,
    "compiled69": 69,
    "originalHost15": 15,
    "priorCompatibility693": 693,
    "rootRecords": 15,
    "priorExplicit121": 121,
    "newScripts": 4
  },
  "liveRows": {
    "L01": "UNVERIFIED",
    "L02": "UNVERIFIED",
    "L03": "UNVERIFIED",
    "L04": "UNVERIFIED",
    "L05": "UNVERIFIED"
  }
}

Full HEAD pin:91084c0c065373a978c8437f8f8362c4f5e4dbc9. Product Source:3edf247ab44d3332bc4bab5f3a43104536d84ce9, candidate720cb380d07102d72b20a6a4f5f7787a0ab88f2b. Sole owner-confirmed GPT-6.1-Sol xhigh operator; actual integration CWD. Orca historical main ownership disclosed; main working-tree files unused.

Exact two roots bound from genuine prior trace8988. Native schedule is only serial /usr/sbin/diskutil info -plist, once per root, stopping on first uncertainty. Each child has fixed argv/environment,64KiB combined output,10s deadline, shared60s, mount-only SIGTERM/250ms SIGKILL escalation and confirmed close. No native trial.

Shipped pure parseReadonlyMountMetadata validates exact MountPoint and three typed false Writable fields. lstat snapshots include canonical / ancestors and known suffix, before/after queries and immediate listings; runtime bundle component chains/leaves only. No runtime file contents opened or plutil conversion. Permissions/devices are recorded metadata, not newly approved trust.

All raw bytes, original and retained hashes/sizes/completeness, child events/argv/cwd, filesystem identity traces and explicit Source/dist/original-host/prior compatibility/Root record hash vectors are private and adjacent. Only new operator-legacy-volume-diagnosis artifacts were written. No fake-host caches/traces/symlinks followed.

Production compatibility was not repeated. No Source/dist changes, tests/builds/commits, account/config/admission/journal/lease/Devices, simulator/device/SDK/network/backend, app/migration/activation/live/download/mount/permission/cleanup/claim operations. Legacy trust proposal remains unapproved; L01–L05 UNVERIFIED. Return idle.
